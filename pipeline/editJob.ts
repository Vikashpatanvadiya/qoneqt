// Re-render from the editor: start from a finished video's edit bundle, apply the creator's scene edits
// (delete, reorder, on-screen text, narration, layout, replacement image), then QA, render and QA again.
// The agents are skipped on purpose: the creator is in control of this version.
import fs from "node:fs";
import { gradeKey } from "./packs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import type { PulseVideoProps, RenderScene } from "../shared/types";
import { config } from "./config";
import { DOCUMENTARY_STYLE, gradeImage } from "./imageLook";
import type { Engine } from "./providers";
import { qaScenes, qaVideo, summarizeChecks, type QaCheck } from "./qa";
import { normalizeForSpeech, polishVoice, type SoundOptions } from "./sound";
import type { StageRunner } from "./generate";

export type SceneEdit = {
  id: string;
  onScreenText?: string;
  narration?: string;
  layout?: "full_image" | "text_card" | "stat_card" | "quote_card";
  image?: { upload?: string; prompt?: string };
};
export type EditOptions = { fromJob: string; scenes: SceneEdit[] };

const UUID = /^[0-9a-f-]{36}$/i;
export function parseEdit(raw: unknown): EditOptions | undefined {
  const o = (raw && typeof raw === "object" ? raw : {}) as { fromJob?: unknown; scenes?: unknown };
  if (typeof o.fromJob !== "string" || !UUID.test(o.fromJob) || !Array.isArray(o.scenes) || o.scenes.length === 0) return undefined;
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : undefined);
  const scenes = o.scenes.slice(0, 12).flatMap((s): SceneEdit[] => {
    if (!s || typeof s !== "object" || typeof (s as SceneEdit).id !== "string") return [];
    const e = s as Record<string, unknown>;
    const img = (e.image && typeof e.image === "object" ? e.image : {}) as { upload?: unknown; prompt?: unknown };
    const upload = typeof img.upload === "string" && /^uploads\/[0-9a-f-]{36}\/\d{1,2}\.(jpg|png|webp)$/.test(img.upload) ? img.upload : undefined;
    const layout = ["full_image", "text_card", "stat_card", "quote_card"].includes(e.layout as string) ? (e.layout as SceneEdit["layout"]) : undefined;
    return [{ id: String(e.id).slice(0, 10), onScreenText: str(e.onScreenText, 80), narration: str(e.narration, 400), layout, image: upload || str(img.prompt, 400) ? { upload, prompt: str(img.prompt, 400) } : undefined }];
  });
  return scenes.length ? { fromJob: o.fromJob, scenes } : undefined;
}

const storageUrl = (p: string) => `${config.supabase.url()}/storage/v1/object/public/videos/${p}`;

async function download(url: string, file: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`Download failed (HTTP ${res.status}): ${url.split("/").slice(-2).join("/")}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

export async function generateEdit(input: { edit: EditOptions; engine: Engine; sound: SoundOptions; voice: string; voiceLocked: boolean; workDir: string; stage: StageRunner }) {
  const { edit, engine, sound, workDir, stage } = input;
  const publicDir = path.join(workDir, "public");
  fs.mkdirSync(publicDir, { recursive: true });

  const props = await stage("assets", async () => {
    const base = `${edit.fromJob}/edit/`;
    const res = await fetch(storageUrl(`${base}props.json`), { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error("This video has no edit bundle (it was made before editing was added)");
    const source = (await res.json()) as PulseVideoProps;

    // Every file the source used, so unchanged scenes render exactly as before.
    const names = new Set<string>();
    for (const s of source.scenes) [s.imageFile, s.audioFile].forEach((n) => n && names.add(n));
    for (const n of [source.musicFile, source.logoFile, source.grainFile, source.sound?.bedFile, ...Object.values(source.sound?.sfx ?? {})]) if (n) names.add(n);
    await Promise.all([...names].map((n) => download(storageUrl(base + n), path.join(publicDir, n)).catch(() => undefined)));

    const changes = { deleted: source.scenes.length - edit.scenes.length, reordered: false, text: 0, voice: 0, images: 0, cards: 0 };
    changes.reordered = edit.scenes.some((e, i) => source.scenes.filter((s) => edit.scenes.some((x) => x.id === s.id))[i]?.id !== e.id);
    const problems: string[] = [];

    const scenes: RenderScene[] = [];
    for (const e of edit.scenes) {
      const src = source.scenes.find((s) => s.id === e.id);
      if (!src) continue;
      const scene: RenderScene = { ...src, titleFontSize: undefined, captionFontSize: undefined, highContrast: undefined };
      if (e.onScreenText && e.onScreenText !== src.onScreenText) {
        scene.onScreenText = e.onScreenText;
        changes.text++;
      }
      // New narration means a new voice track and new caption timings. A creator's own voiceover cannot be re-spoken.
      if (e.narration && e.narration !== src.narration && !input.voiceLocked) {
        const tts = await engine.tts.speak(normalizeForSpeech(e.narration), { voice: input.voice, baseRatePct: sound.voiceRatePct });
        const file = `${scene.id}_v2.mp3`;
        try {
          polishVoice(tts.audioFile, path.join(publicDir, file));
        } catch {
          fs.copyFileSync(tts.audioFile, path.join(publicDir, file));
        }
        Object.assign(scene, { narration: e.narration, audioFile: file, durationSec: tts.durationSec + config.scenePaddingSec, words: tts.words });
        changes.voice++;
      }
      if (e.image?.upload) {
        try {
          const raw = path.join(workDir, `${scene.id}-upload${path.extname(e.image.upload)}`);
          await download(storageUrl(e.image.upload), raw);
          const file = `${scene.id}_u.jpg`;
          gradeImage({ inFile: raw, outFile: path.join(publicDir, file), theme: gradeKey(source.global) });
          Object.assign(scene, { imageFile: file, layout: "full_image", source: "upload" });
          changes.images++;
        } catch (err) {
          problems.push(`${scene.id}: upload could not be used (${(err as Error).message.slice(0, 80)})`);
        }
      } else if (e.image?.prompt) {
        try {
          const img = await engine.image.generate(`${e.image.prompt}. ${source.global.stylePrompt}. ${DOCUMENTARY_STYLE}. Vertical 9:16 composition.`);
          const file = `${scene.id}_p.jpg`;
          gradeImage({ inFile: img.file, outFile: path.join(publicDir, file), theme: gradeKey(source.global) });
          Object.assign(scene, { imageFile: file, layout: "full_image", source: "ai" });
          changes.images++;
        } catch (err) {
          problems.push(`${scene.id}: new image failed, kept the old one (${(err as Error).message.slice(0, 80)})`);
        }
      }
      if (e.layout && e.layout !== "full_image" && !e.image) {
        Object.assign(scene, { layout: e.layout, imageFile: null });
        changes.cards++;
      }
      scenes.push(scene);
    }
    if (scenes.length === 0) throw new Error("The edit has no scenes left");
    const parts = [
      changes.deleted > 0 && `${changes.deleted} scene${changes.deleted > 1 ? "s" : ""} cut`,
      changes.reordered && "scenes reordered",
      changes.text && `${changes.text} text edit${changes.text > 1 ? "s" : ""}`,
      changes.voice && `${changes.voice} line${changes.voice > 1 ? "s" : ""} re-voiced`,
      changes.images && `${changes.images} image${changes.images > 1 ? "s" : ""} replaced`,
      changes.cards && `${changes.cards} scene${changes.cards > 1 ? "s" : ""} turned into cards`,
    ].filter(Boolean);
    return {
      value: { ...source, scenes } as PulseVideoProps,
      summary: `Edited version: ${scenes.length} scenes. ${parts.length ? parts.join(", ") : "No changes"}.`,
      reason: problems.join(" | ") || "Your edits were applied. The agents are skipped for edited versions.",
      output: { fromJob: edit.fromJob, changes, problems },
    };
  });

  const durationSec = props.scenes.reduce((n, s) => n + s.durationSec, 0) + config.video.outroSec;
  const videoFile = path.join(workDir, "video.mp4");
  const thumbFile = path.join(workDir, "thumb.jpg");
  const pre = qaScenes({ scenes: props.scenes, publicDir });
  const finalProps: PulseVideoProps = { ...props, scenes: pre.scenes };

  await stage("render", async () => {
    fs.writeFileSync(path.join(workDir, "props.json"), JSON.stringify(finalProps, null, 2));
    const serveUrl = await bundle({ entryPoint: path.resolve("remotion/index.ts"), publicDir });
    const composition = await selectComposition({ serveUrl, id: "PulseVideo", inputProps: finalProps });
    const start = Date.now();
    await renderMedia({ composition, serveUrl, codec: "h264", crf: config.render.crf(), scale: config.render.scale(), outputLocation: videoFile, inputProps: finalProps, concurrency: os.cpus().length });
    execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", "0.5", "-i", videoFile, "-frames:v", "1", "-vf", "scale=540:-2", "-q:v", "4", thumbFile]);
    const sizeMb = fs.statSync(videoFile).size / 1024 / 1024;
    return { value: null, summary: `${durationSec.toFixed(1)}s video, ${sizeMb.toFixed(1)} MB, rendered in ${((Date.now() - start) / 1000).toFixed(0)}s`, output: { sizeMb, durationSec } };
  });

  const qa = await stage("qa", async () => {
    const post = qaVideo(videoFile, durationSec);
    const checks: QaCheck[] = [...pre.checks, ...post.checks];
    const s = summarizeChecks(checks);
    return { value: checks, status: s.fixed ? ("fixed" as const) : ("done" as const), summary: `${checks.length} checks: ${s.passed} passed, ${s.fixed} fixed, ${s.flagged} flagged.`, output: { checks } };
  });

  return { title: props.title, videoFile, thumbFile, durationSec, propsFile: path.join(workDir, "props.json"), publicDir, qa };
}
