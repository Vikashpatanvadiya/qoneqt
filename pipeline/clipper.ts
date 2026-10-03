// Clipper: a long video (a link or an upload) in, several short 9:16 clips out.
// download -> transcribe -> find clips (LLM) -> reframe (faces, pauses) -> render (Remotion) -> QA.
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { CLIP_FPS, CLIP_LENGTHS, keptSeconds, type ClipLayout, type ClipLength, type ClipOptions, type ClipVideoProps, type CropKey, type KeepRange } from "../shared/clip";
import type { WordTiming } from "../shared/types";
import { runClipFinder, type ClipIdea } from "./agents/clipFinder";
import { config } from "./config";
import { BUCKET, db } from "./db";
import type { StageRunner } from "./generate";
import { PACKS } from "../src/styles/packs";
import { lockPack, packLog } from "./packs";
import type { Engine } from "./providers";
import { summarizeAttempts } from "./providers/llm";
import { qaVideo } from "./qa";

const LAYOUTS: ClipLayout[] = ["auto", "face", "blur", "split"];
const UPLOAD_PATH = /^uploads\/[0-9a-f-]{36}\/source\.(mp4|mov|webm|mkv|m4v)$/;

export function parseClipOptions(raw: unknown): ClipOptions | null {
  const o = (raw && typeof raw === "object" ? raw : null) as Record<string, unknown> | null;
  if (!o || o.rightsConfirmed !== true) return null;
  const src = (o.source ?? {}) as Record<string, unknown>;
  let source: ClipOptions["source"];
  if (src.kind === "url" && typeof src.url === "string" && /^https?:\/\/\S+$/.test(src.url)) source = { kind: "url", url: src.url.slice(0, 500) };
  else if (src.kind === "upload" && typeof src.path === "string" && UPLOAD_PATH.test(src.path)) source = { kind: "upload", path: src.path, name: String(src.name ?? "video").slice(0, 80) };
  else return null;
  const count = Math.min(10, Math.max(1, Math.round(Number(o.count) || 5)));
  return {
    source,
    layout: LAYOUTS.includes(o.layout as ClipLayout) ? (o.layout as ClipLayout) : "auto",
    count,
    length: (Object.keys(CLIP_LENGTHS) as ClipLength[]).includes(o.length as ClipLength) ? (o.length as ClipLength) : "medium",
    removePauses: o.removePauses !== false,
    captions: o.captions !== false,
    rightsConfirmed: true,
  };
}

// Runs a Python helper and returns its stdout. The helpers print JSON.
function python(args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(config.tts.pythonBin(), args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve(out);
      // fetch_video.py prints {"error"} with a message meant for the user
      try {
        const parsed = JSON.parse(out.trim().split("\n").pop() ?? "");
        if (parsed?.error) return reject(new Error(parsed.error));
      } catch {
        /* not JSON */
      }
      reject(new Error(`${path.basename(args[0])} failed (${code}): ${err.slice(-300)}`));
    });
  });
}

type Probe = { width: number; height: number; durationSec: number };
function probe(file: string): Probe {
  const out = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:stream_side_data=rotation:format=duration", "-of", "json", file]).toString();
  const j = JSON.parse(out);
  const s = j.streams?.[0] ?? {};
  const rot = Math.abs(Number(s.side_data_list?.find((d: { rotation?: number }) => d.rotation !== undefined)?.rotation ?? 0));
  const [w, h] = rot === 90 || rot === 270 ? [s.height, s.width] : [s.width, s.height];
  return { width: Number(w), height: Number(h), durationSec: Number(j.format?.duration ?? 0) };
}

const maxSourceSec = () => Number(process.env.CLIP_MAX_SOURCE_MIN ?? 90) * 60;

// Sentences with times, built from word timings: the unit the Clip Finder and the snapping work on.
type Sentence = { start: number; end: number; text: string; first: number; last: number };
function sentences(words: WordTiming[]): Sentence[] {
  const out: Sentence[] = [];
  let first = 0;
  words.forEach((w, i) => {
    const next = words[i + 1];
    const ends = /[.!?]["')\]]?$/.test(w.word) || !next || next.startSec - w.endSec > 0.9 || i - first >= 40;
    if (ends) {
      out.push({ start: words[first].startSec, end: w.endSec, text: words.slice(first, i + 1).map((x) => x.word).join(" "), first, last: i });
      first = i + 1;
    }
  });
  return out;
}

// Snaps an idea to whole sentences inside the length range. Returns null when no valid clip fits.
function snap(idea: { startSec: number; endSec: number }, list: Sentence[], minSec: number, maxSec: number): { a: number; b: number } | null {
  let a = list.findIndex((s) => s.end > idea.startSec);
  if (a < 0) return null;
  if (list[a].start < idea.startSec - 1.5 && a + 1 < list.length && list[a + 1].start - idea.startSec < 3) a += 1;
  let b = a;
  while (b + 1 < list.length && list[b + 1].start < idea.endSec - 0.5) b++;
  const len = () => list[b].end - list[a].start;
  while (len() < minSec && b + 1 < list.length && list[b + 1].end - list[a].start <= maxSec) b++;
  while (len() > maxSec && b > a) b--;
  if (len() < minSec * 0.8 || len() > maxSec + 2) return null;
  return { a, b };
}

// Keeps the spoken parts: pauses longer than 0.6 s are cut down to a short breath.
function keepRanges(words: WordTiming[], clipLen: number, removePauses: boolean): KeepRange[] {
  if (words.length === 0) return [{ from: 0, to: clipLen }];
  const start = Math.max(0, words[0].startSec - 0.15);
  const end = Math.min(clipLen, words[words.length - 1].endSec + 0.35);
  if (!removePauses) return [{ from: start, to: end }];
  const ranges: KeepRange[] = [];
  let from = start;
  for (let i = 0; i + 1 < words.length; i++) {
    const gap = words[i + 1].startSec - words[i].endSec;
    if (gap > 0.6) {
      ranges.push({ from, to: words[i].endSec + 0.15 });
      from = words[i + 1].startSec - 0.12;
    }
  }
  ranges.push({ from, to: end });
  return ranges.filter((r) => r.to - r.from > 0.08);
}

// Word times in the clip file -> output times after the pauses are cut.
function remapWords(words: WordTiming[], keep: KeepRange[]): WordTiming[] {
  const offsets: number[] = [];
  let acc = 0;
  for (const r of keep) {
    offsets.push(acc);
    acc += r.to - r.from;
  }
  const map = (t: number) => {
    const i = keep.findIndex((r) => t >= r.from - 0.001 && t <= r.to + 0.001);
    if (i >= 0) return offsets[i] + (t - keep[i].from);
    const next = keep.findIndex((r) => r.from > t);
    return next >= 0 ? offsets[next] : acc;
  };
  return words.map((w) => ({ word: w.word, startSec: map(w.startSec), endSec: Math.max(map(w.startSec) + 0.05, map(w.endSec)) }));
}

// Face track -> smooth crop keys. Picks the face that best continues the current shot, fills gaps,
// removes jitter with a median filter, and only moves the "camera" when the face moves clearly.
type FaceSamples = { width: number; height: number; samples: Array<{ t: number; faces: number[][] }> };
function cropTrack(f: FaceSamples): { keys: CropKey[]; faceShare: number } {
  let prev = 0.5;
  const raw: Array<number | null> = f.samples.map((s) => {
    if (s.faces.length === 0) return null;
    const best = s.faces.reduce((a, b) => (b[2] * b[3] * b[4] - Math.abs(b[0] - prev) * 0.05 > a[2] * a[3] * a[4] - Math.abs(a[0] - prev) * 0.05 ? b : a));
    prev = best[0];
    return best[0];
  });
  const faceShare = raw.filter((x) => x !== null).length / Math.max(1, raw.length);
  const firstSeen = raw.find((x) => x !== null) ?? 0.5;
  let last = firstSeen;
  const filled = raw.map((x) => (x === null ? last : (last = x)));
  const median = filled.map((_, i) => {
    const win = filled.slice(Math.max(0, i - 2), i + 3).sort((a, b) => a - b);
    return win[Math.floor(win.length / 2)];
  });
  const keys: CropKey[] = [];
  let cam = median[0] ?? 0.5;
  median.forEach((x, i) => {
    if (Math.abs(x - cam) > 0.07) cam = cam + (x - cam) * 0.6;
    keys.push({ t: f.samples[i].t, x: Number(cam.toFixed(4)) });
  });
  return { keys, faceShare };
}

export type ClipJobResult = {
  title: string;
  pack: ReturnType<typeof packLog>;
  clips: Array<{ index: number; idea: ClipIdea; startSec: number; endSec: number; durationSec: number; layout: Exclude<ClipLayout, "auto">; videoFile: string; thumbFile: string; sizeMb: number }>;
  sourceSec: number;
  metrics: Record<string, unknown>;
};

export async function generateClips(input: { options: ClipOptions; engine: Engine; stylePack?: string; lastPack?: string; workDir: string; stage: StageRunner }): Promise<ClipJobResult> {
  const { options, engine, workDir, stage } = input;
  const publicDir = path.join(workDir, "public");
  fs.mkdirSync(publicDir, { recursive: true });
  const range = CLIP_LENGTHS[options.length];
  const metrics: Record<string, unknown> = { engine: "clipper", llm_calls: 0 };

  // 1. Get the source video
  const source = await stage("download", async () => {
    let file: string;
    let title: string;
    if (options.source.kind === "url" && options.source.url.startsWith("file://")) {
      // Local runs only (scripts/clip.ts). The API accepts http(s) links only.
      file = options.source.url.slice("file://".length);
      title = path.basename(file).replace(/\.[a-z0-9]+$/i, "");
    } else if (options.source.kind === "url") {
      const out = await python([path.resolve("scripts/fetch_video.py"), options.source.url, workDir, String(maxSourceSec())], 20 * 60_000);
      const info = JSON.parse(out.trim().split("\n").pop()!);
      file = info.file;
      title = info.title ?? "Video";
    } else {
      const { data, error } = await db().storage.from(BUCKET).download(options.source.path);
      if (error || !data) throw new Error(`Could not read the uploaded video: ${error?.message ?? "no data"}`);
      file = path.join(workDir, path.basename(options.source.path));
      fs.writeFileSync(file, Buffer.from(await data.arrayBuffer()));
      title = options.source.name.replace(/\.[a-z0-9]+$/i, "");
    }
    const p = probe(file);
    if (!p.width || !p.height) throw new Error("This file has no video track");
    if (p.durationSec > maxSourceSec() + 5) throw new Error(`The video is ${Math.round(p.durationSec / 60)} min long; the limit is ${Math.round(maxSourceSec() / 60)} min`);
    if (p.durationSec < range.min) throw new Error(`The video is only ${Math.round(p.durationSec)} s long; clips need at least ${range.min} s`);
    return {
      value: { file, title, ...p },
      summary: `"${title}" · ${Math.floor(p.durationSec / 60)}:${String(Math.round(p.durationSec % 60)).padStart(2, "0")} · ${p.width}x${p.height}`,
      reason: options.source.kind === "url" ? "Downloaded from the link (the user confirmed they have the rights)" : "Read from your upload",
      output: { title, durationSec: p.durationSec, width: p.width, height: p.height, source: options.source.kind },
    };
  });

  // 2. Word-timed transcript of the whole video
  const words = await stage("transcribe", async () => {
    const wav = path.join(workDir, "audio.wav");
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", source.file, "-vn", "-ac", "1", "-ar", "16000", wav]);
    const json = path.join(workDir, "transcript.json");
    const start = Date.now();
    await python([path.resolve("scripts/transcribe.py"), wav, json, process.env.WHISPER_MODEL || "base"], 40 * 60_000);
    const t = JSON.parse(fs.readFileSync(json, "utf8")) as { language: string; words: WordTiming[] };
    if (t.words.length < 20) throw new Error("Almost no speech was found in this video, so there is nothing to clip");
    return {
      value: t.words,
      summary: `${t.words.length} words (${t.language}) transcribed in ${Math.round((Date.now() - start) / 1000)} s`,
      output: { language: t.language, words: t.words.length },
    };
  });

  const list = sentences(words);

  // 3. The Clip Finder proposes moments; code snaps, checks and ranks them
  const chosen = await stage("find_clips", async () => {
    const lines = list.map((s) => `[${s.start.toFixed(1)} - ${s.end.toFixed(1)}] ${s.text}`).join("\n");
    let ideas: ClipIdea[] = [];
    let model = "";
    let fallback = false;
    try {
      const res = await runClipFinder(engine.llm, { title: source.title, lines, count: options.count, minSec: range.min, maxSec: range.max, durationSec: source.durationSec });
      ideas = res.data.clips;
      model = res.model;
      metrics.llm_calls = summarizeAttempts(res.attempts).calls;
    } catch (err) {
      fallback = true;
      console.warn(`  [find_clips] LLM failed, using evenly spaced clips: ${(err as Error).message.slice(0, 120)}`);
    }
    const picked: Array<{ idea: ClipIdea; a: number; b: number }> = [];
    const overlaps = (a: number, b: number) => picked.some((p) => !(list[b].end <= list[p.a].start || list[a].start >= list[p.b].end));
    for (const idea of [...ideas].sort((x, y) => y.score - x.score)) {
      const s = snap(idea, list, range.min, range.max);
      if (s && !overlaps(s.a, s.b)) picked.push({ idea, ...s });
      if (picked.length >= options.count) break;
    }
    // Fallback (or too few ideas): evenly spaced sentence-aligned windows, marked as such
    for (let k = 0; picked.length < options.count && k < options.count * 3; k++) {
      const at = ((k + 0.5) / (options.count * 3)) * source.durationSec;
      const s = snap({ startSec: at, endSec: at + (range.min + range.max) / 2 }, list, range.min, range.max);
      if (!s || overlaps(s.a, s.b)) continue;
      const text = list[s.a].text;
      picked.push({ idea: { title: text.split(" ").slice(0, 6).join(" "), hook: "", startSec: list[s.a].start, endSec: list[s.b].end, reason: "Picked by position (the Clip Finder was not available)", score: 5, emphasisWords: [] }, ...s });
    }
    if (picked.length === 0) throw new Error("No clip of the chosen length fits this video");
    picked.sort((x, y) => list[x.a].start - list[y.a].start);
    return {
      value: picked,
      status: fallback ? ("fixed" as const) : ("done" as const),
      summary: `${picked.length} clips picked from ${ideas.length} ideas${fallback ? " (fallback: evenly spaced)" : ""}`,
      reason: picked.map((p) => `${p.idea.title} (${p.idea.score}/10): ${p.idea.reason}`).join(" | "),
      output: { model, ideas, picked: picked.map((p) => ({ title: p.idea.title, score: p.idea.score, startSec: list[p.a].start, endSec: list[p.b].end, reason: p.idea.reason })) },
    };
  });

  const lock = lockPack({ directorPick: undefined, userPick: input.stylePack, lastPack: input.lastPack, seed: source.title });

  // 4. Cut each clip, follow the face, remove pauses
  const prepared = await stage("reframe", async () => {
    const out: Array<{ props: ClipVideoProps; idea: ClipIdea; startSec: number; endSec: number }> = [];
    const notes: string[] = [];
    for (const [i, c] of chosen.entries()) {
      const startSec = Math.max(0, list[c.a].start - 0.3);
      const endSec = Math.min(source.durationSec, list[c.b].end + 0.5);
      const name = `clip${i + 1}.mp4`;
      const file = path.join(publicDir, name);
      execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", startSec.toFixed(3), "-to", endSec.toFixed(3), "-i", source.file, "-vf", "scale=-2:'min(1080,ih)'", "-r", String(CLIP_FPS), "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-c:a", "aac", "-b:a", "160k", file]);
      const p = probe(file);
      let layout: Exclude<ClipLayout, "auto"> = options.layout === "auto" ? "face" : options.layout;
      let crop: CropKey[] = [];
      if (layout !== "blur") {
        const faces = JSON.parse(await python([path.resolve("scripts/faces.py"), file, "0", String(p.durationSec), "2"], 10 * 60_000)) as FaceSamples;
        const track = cropTrack(faces);
        crop = track.keys;
        if (options.layout === "auto" && (track.faceShare < 0.4 || p.width <= p.height)) layout = p.width <= p.height ? "face" : "blur";
        notes.push(`clip ${i + 1}: face in ${Math.round(track.faceShare * 100)}% of frames → ${layout}`);
      } else notes.push(`clip ${i + 1}: blurred fill`);
      const clipWords = words.filter((w) => w.startSec >= startSec && w.endSec <= endSec).map((w) => ({ ...w, startSec: w.startSec - startSec, endSec: w.endSec - startSec }));
      const keep = keepRanges(clipWords, p.durationSec, options.removePauses);
      let backgroundFile: string | null = null;
      if (layout === "split") backgroundFile = await splitBackground(publicDir, `bg${i + 1}.mp4`, keptSeconds(keep));
      if (layout === "blur") {
        // Blurred fill, baked once at low resolution: same timing as the clip file.
        backgroundFile = `blur${i + 1}.mp4`;
        execFileSync("ffmpeg", ["-v", "error", "-y", "-i", file, "-an", "-vf", "scale=270:480:force_original_aspect_ratio=increase,crop=270:480,boxblur=12:2,eq=brightness=-0.22:saturation=1.1,scale=1080:1920", "-r", String(CLIP_FPS), "-c:v", "libx264", "-preset", "veryfast", "-crf", "30", path.join(publicDir, backgroundFile)]);
      }
      out.push({
        idea: c.idea,
        startSec,
        endSec,
        props: { title: c.idea.title, hook: c.idea.hook, videoFile: name, backgroundFile, source: { width: p.width, height: p.height }, layout, crop, keep, words: remapWords(clipWords, keep), emphasisWords: c.idea.emphasisWords, captions: options.captions, packId: lock.packId },
      });
    }
    const cut = out.reduce((n, o) => n + (o.endSec - o.startSec - keptSeconds(o.props.keep)), 0);
    return { value: out, summary: `${out.length} clips cut and reframed${options.removePauses ? `, ${cut.toFixed(1)} s of pauses removed` : ""}`, reason: notes.join("; "), output: { notes, pack: lock.reason } };
  });

  // 5. Render every clip
  const rendered = await stage("render", async () => {
    const serveUrl = await bundle({ entryPoint: path.resolve("remotion/index.ts"), publicDir });
    const files: Array<{ videoFile: string; thumbFile: string; renderSec: number }> = [];
    for (const [i, c] of prepared.entries()) {
      const start = Date.now();
      const composition = await selectComposition({ serveUrl, id: "ClipVideo", inputProps: c.props });
      const videoFile = path.join(workDir, `out${i + 1}.mp4`);
      const thumbFile = path.join(workDir, `thumb${i + 1}.jpg`);
      await renderMedia({ composition, serveUrl, codec: "h264", crf: config.render.crf(), scale: config.render.scale(), outputLocation: videoFile, inputProps: c.props, concurrency: os.cpus().length });
      await renderStill({ composition, serveUrl, inputProps: c.props, frame: Math.min(composition.durationInFrames - 1, Math.round(1.2 * CLIP_FPS)), output: thumbFile, imageFormat: "jpeg" });
      files.push({ videoFile, thumbFile, renderSec: (Date.now() - start) / 1000 });
    }
    const total = files.reduce((n, f) => n + f.renderSec, 0);
    return { value: files, summary: `${files.length} clips rendered in ${Math.round(total)} s (${lock.packId.replace("_", " ")} style)`, output: { renderSec: files.map((f) => Math.round(f.renderSec)) } };
  });

  // 6. Loudness and size checks on every clip
  const clips = await stage("qa", async () => {
    const results: ClipJobResult["clips"] = [];
    const notes: string[] = [];
    for (const [i, c] of prepared.entries()) {
      const durationSec = keptSeconds(c.props.keep);
      const qa = qaVideo(rendered[i].videoFile, durationSec + config.video.outroSec);
      const fixed = qa.checks.filter((x) => x.status === "fixed").length;
      notes.push(`clip ${i + 1}: ${qa.checks.filter((x) => x.status === "pass").length} passed${fixed ? `, ${fixed} fixed` : ""}`);
      results.push({ index: i + 1, idea: c.idea, startSec: c.startSec, endSec: c.endSec, durationSec, layout: c.props.layout, videoFile: rendered[i].videoFile, thumbFile: rendered[i].thumbFile, sizeMb: Number((fs.statSync(rendered[i].videoFile).size / 1024 / 1024).toFixed(1)) });
    }
    return { value: results, summary: notes.join("; ") };
  });

  return { title: source.title, pack: packLog({ stylePrompt: "", palette: PACKS[lock.packId].palette.accent, musicMood: "upbeat", packId: lock.packId }), clips, sourceSec: source.durationSec, metrics };
}

// Split-screen bottom half: a random clip from the bucket's backgrounds/ folder (videos you have the rights to),
// looped and trimmed to the clip. Without one, the composition draws a moving pack-coloured background.
async function splitBackground(publicDir: string, name: string, seconds: number): Promise<string | null> {
  const { data } = await db().storage.from(BUCKET).list("backgrounds", { limit: 100 });
  const videos = (data ?? []).filter((f) => /\.(mp4|mov|webm)$/i.test(f.name));
  if (videos.length === 0) return null;
  const pick = videos[Math.floor(Math.random() * videos.length)];
  const dl = await db().storage.from(BUCKET).download(`backgrounds/${pick.name}`);
  if (dl.error || !dl.data) return null;
  const raw = path.join(publicDir, `raw-${name}`);
  fs.writeFileSync(raw, Buffer.from(await dl.data.arrayBuffer()));
  execFileSync("ffmpeg", ["-v", "error", "-y", "-stream_loop", "-1", "-i", raw, "-t", (seconds + 1).toFixed(2), "-an", "-vf", "scale=1080:960:force_original_aspect_ratio=increase,crop=1080:960", "-r", String(CLIP_FPS), "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", path.join(publicDir, name)]);
  fs.rmSync(raw);
  return name;
}
