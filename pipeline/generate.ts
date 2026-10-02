// The Phase 1 pipeline: one Gemini call for script + scenes, FLUX images, edge-tts voice, Remotion render.
// Used by the local CLI (scripts/gen.ts) and by the GitHub Action (pipeline/run.ts).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { z } from "zod";
import type { PulseVideoProps, RenderScene } from "../shared/types";
import { config } from "./config";
import { fluxNeurons } from "./cost/pricing";
import { cloudflareImage } from "./providers/image";
import { geminiLlm } from "./providers/llm";
import { edgeTts } from "./providers/tts";
import { mapLimit } from "./util";

export type StageName = "ingest" | "research" | "script" | "script_critic" | "direct" | "assets" | "vision_critic" | "render" | "upload";

export type StageResult<T> = { value: T; summary: string; reason?: string; output?: unknown };

// Wraps a stage so the caller decides where progress goes (console, Supabase).
export type StageRunner = <T>(name: StageName, fn: () => Promise<StageResult<T>>) => Promise<T>;

export type GenerateResult = {
  title: string;
  videoFile: string;
  thumbFile: string;
  durationSec: number;
  metrics: { llm_calls: number; images: number; images_cached: number; fallbacks: number; neurons_est: number };
};

const DraftSchema = z.object({
  title: z.string(),
  stylePrompt: z.string().describe("One visual style line added to every image prompt for consistency"),
  scenes: z
    .array(
      z.object({
        id: z.string().describe('"s1", "s2", ...'),
        narration: z.string().describe("Spoken line, max 25 words"),
        onScreenText: z.string().describe("Max 6 words"),
        visualPrompt: z.string().describe("One strong image for this scene. No text inside the image"),
      }),
    )
    .min(5)
    .max(8),
});

const SYSTEM = `You write short vertical videos for Qoneqt, a community-first social platform.
Rules:
- 5 to 8 scenes, 30 to 45 seconds when spoken (about 2.5 words per second).
- Scene 1 is the hook. No greetings, no "in this video".
- One idea per scene. Short sentences. Simple spoken English.
- End with a question that makes the community comment.
- Each visualPrompt describes one image with no text in it.
Return only JSON.`;

function imageSize(file: string): { width: number; height: number } {
  const out = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file]).toString();
  const [width, height] = out.trim().split(",").map(Number);
  return { width, height };
}

export async function generateVideo(input: { topic: string; workDir: string; stage: StageRunner }): Promise<GenerateResult> {
  const { topic, workDir, stage } = input;
  const publicDir = path.join(workDir, "public");
  fs.rmSync(publicDir, { recursive: true, force: true });
  fs.mkdirSync(publicDir, { recursive: true });
  const metrics = { llm_calls: 0, images: 0, images_cached: 0, fallbacks: 0, neurons_est: 0 };

  const draft = await stage("script", async () => {
    const { data, usage } = await geminiLlm.generateJson({ label: "script", system: SYSTEM, prompt: `Topic: ${topic}`, schema: DraftSchema });
    metrics.llm_calls += usage.length;
    return { value: data, summary: `"${data.title}", ${data.scenes.length} scenes`, output: { draft: data, usage } };
  });

  const scenes = await stage("assets", async () => {
    const value = await mapLimit(draft.scenes, config.maxParallelAssets, async (scene): Promise<RenderScene> => {
      const [image, voice] = await Promise.all([
        cloudflareImage.generate(`${scene.visualPrompt}. ${draft.stylePrompt}. Vertical composition, no text, no watermark.`).catch((err) => {
          console.warn(`  [image] ${scene.id} failed, using gradient fallback: ${(err as Error).message.slice(0, 160)}`);
          return null;
        }),
        edgeTts.speak(scene.narration),
      ]);

      let imageFile: string | null = null;
      if (image) {
        imageFile = `${scene.id}.jpg`;
        fs.copyFileSync(image.file, path.join(publicDir, imageFile));
        if (image.cached) {
          metrics.images_cached++;
        } else {
          const size = imageSize(image.file);
          metrics.images++;
          metrics.neurons_est += fluxNeurons(size.width, size.height, image.steps);
        }
      } else {
        metrics.fallbacks++;
      }
      const audioFile = `${scene.id}.mp3`;
      fs.copyFileSync(voice.audioFile, path.join(publicDir, audioFile));
      console.log(`  ${scene.id} image ${image ? (image.cached ? "cached" : `${(image.ms / 1000).toFixed(1)}s`) : "FALLBACK"}, voice ${voice.durationSec.toFixed(1)}s (${voice.timingSource})`);

      return {
        id: scene.id,
        narration: scene.narration,
        onScreenText: scene.onScreenText,
        imageFile,
        audioFile,
        durationSec: voice.durationSec + config.scenePaddingSec,
        words: voice.words,
      };
    });
    return {
      value,
      summary: `${metrics.images} new images, ${metrics.images_cached} cached, ${metrics.fallbacks} fallbacks, ${value.length} voice tracks`,
      output: { neurons_est: metrics.neurons_est },
    };
  });

  const durationSec = scenes.reduce((n, s) => n + s.durationSec, 0);
  const videoFile = path.join(workDir, "video.mp4");
  const thumbFile = path.join(workDir, "thumb.jpg");

  await stage("render", async () => {
    const inputProps: PulseVideoProps = { title: draft.title, scenes };
    fs.writeFileSync(path.join(workDir, "props.json"), JSON.stringify(inputProps, null, 2));
    const serveUrl = await bundle({ entryPoint: path.resolve("remotion/index.ts"), publicDir });
    const composition = await selectComposition({ serveUrl, id: "PulseVideo", inputProps });
    await renderMedia({ composition, serveUrl, codec: "h264", crf: config.render.crf(), outputLocation: videoFile, inputProps, concurrency: os.cpus().length });
    execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", "0.5", "-i", videoFile, "-frames:v", "1", "-vf", "scale=540:-2", "-q:v", "4", thumbFile]);
    const sizeMb = fs.statSync(videoFile).size / 1024 / 1024;
    return { value: null, summary: `${durationSec.toFixed(1)}s video, ${sizeMb.toFixed(1)} MB`, output: { sizeMb, durationSec, cpus: os.cpus().length } };
  });

  return { title: draft.title, videoFile, thumbFile, durationSec, metrics };
}
