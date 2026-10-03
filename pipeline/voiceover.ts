// The creator's own voiceover instead of an AI voice: transcribe it with word timestamps,
// split it into scenes at sentence ends, and cut the audio into one clip per scene so captions stay in sync.
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { WordTiming } from "../shared/types";
import { splitScript } from "./agents/ownScript";
import { config } from "./config";
import type { TtsResult } from "./providers/tts";

export type VoiceoverOption = { path: string; name: string };

export function parseVoiceover(raw: unknown): VoiceoverOption | undefined {
  const o = (raw && typeof raw === "object" ? raw : {}) as { path?: unknown; name?: unknown };
  if (typeof o.path !== "string" || !/^uploads\/[0-9a-f-]{36}\/voice\.(mp3|m4a|wav|webm|ogg|mp4)$/.test(o.path)) return undefined;
  return { path: o.path, name: typeof o.name === "string" ? o.name.slice(0, 80) : "voiceover" };
}

const runPython = (args: string[]) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(config.tts.pythonBin(), args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`transcription failed (${code}): ${err.slice(-300)}`))));
  });

const PAD = 0.12; // seconds kept before the first word of a scene

export type Transcript = { text: string; durationSec: number; language: string; scenes: Array<{ id: string; narration: string; startSec: number; endSec: number; words: WordTiming[]; imageTag: number | null }> };

export async function transcribeVoiceover(input: { voiceover: VoiceoverOption; workDir: string }): Promise<{ transcript: Transcript; wavFile: string }> {
  const dir = path.join(input.workDir, "voiceover");
  fs.mkdirSync(dir, { recursive: true });
  const res = await fetch(`${config.supabase.url()}/storage/v1/object/public/videos/${input.voiceover.path}`, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`Could not download the voiceover (HTTP ${res.status})`);
  const original = path.join(dir, path.basename(input.voiceover.path));
  fs.writeFileSync(original, Buffer.from(await res.arrayBuffer()));
  // One clean 48 kHz mono WAV is used for both transcription and cutting.
  const wavFile = path.join(dir, "voice.wav");
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", original, "-ac", "1", "-ar", "48000", wavFile]);

  const jsonFile = path.join(dir, "words.json");
  await runPython([path.resolve("scripts/transcribe.py"), wavFile, jsonFile, process.env.WHISPER_MODEL || "base"]);
  const raw = JSON.parse(fs.readFileSync(jsonFile, "utf8")) as { language: string; duration: number; words: WordTiming[] };
  if (raw.words.length < 5) throw new Error("The voiceover has too few words to make a video");

  // Scenes come from the transcript's sentences; words are assigned to scenes in order by count.
  const text = raw.words.map((w) => w.word).join(" ");
  const split = splitScript(text);
  const scenes: Transcript["scenes"] = [];
  let cursor = 0;
  split.forEach((s, i) => {
    const count = s.narration.split(/\s+/).filter(Boolean).length;
    const words = raw.words.slice(cursor, cursor + count);
    cursor += count;
    if (!words.length) return;
    const next = raw.words[cursor];
    const startSec = Math.max(0, i === 0 ? 0 : words[0].startSec - PAD);
    const endSec = next ? Math.max(words[words.length - 1].endSec + 0.05, next.startSec - PAD) : Math.min(raw.duration, words[words.length - 1].endSec + 0.4);
    scenes.push({ id: `s${scenes.length + 1}`, narration: s.narration, startSec, endSec, words: words.map((w) => ({ word: w.word, startSec: w.startSec - startSec, endSec: w.endSec - startSec })), imageTag: s.imageTag });
  });
  return { transcript: { text, durationSec: raw.duration, language: raw.language, scenes }, wavFile };
}

// Cuts the scene's part of the voiceover into its own clip, shaped like a TTS result.
export function cutScene(wavFile: string, scene: Transcript["scenes"][number], outFile: string): TtsResult {
  execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", scene.startSec.toFixed(3), "-to", scene.endSec.toFixed(3), "-i", wavFile, "-ac", "1", "-ar", "48000", "-c:a", "libmp3lame", "-q:a", "3", outFile]);
  const durationSec = scene.endSec - scene.startSec;
  return { audioFile: outFile, durationSec, rawDurationSec: durationSec, words: scene.words, timingSource: "whisper", cached: false, ms: 0 };
}
