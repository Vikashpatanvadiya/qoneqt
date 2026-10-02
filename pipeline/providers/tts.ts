import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { WordTiming } from "../../shared/types";
import { config } from "../config";
import { sha, withRetry } from "../util";

const execFileAsync = promisify(execFile);

export type TtsResult = {
  audioFile: string;
  durationSec: number;
  words: WordTiming[];
  timingSource: "edge-tts" | "even-split";
  cached: boolean;
  ms: number;
};

export interface TtsProvider {
  speak(text: string): Promise<TtsResult>;
}

function runPython(args: string[], stdin: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(config.tts.pythonBin(), args, { stdio: ["pipe", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`edge-tts exited ${code}: ${stderr.slice(-300)}`))));
    child.stdin.end(stdin);
  });
}

async function audioDurationSec(file: string): Promise<number> {
  const { stdout } = await execFileAsync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  const sec = Number(stdout.trim());
  if (!Number.isFinite(sec) || sec <= 0) throw new Error(`Could not read duration of ${file}`);
  return sec;
}

// Last-resort timings: spread the words evenly, weighted by length.
function evenSplit(text: string, durationSec: number): WordTiming[] {
  const tokens = text.split(/\s+/).filter(Boolean);
  const total = tokens.reduce((n, w) => n + w.length + 1, 0);
  let t = 0;
  return tokens.map((word) => {
    const d = ((word.length + 1) / total) * durationSec;
    const timing = { word, startSec: t, endSec: t + d };
    t += d;
    return timing;
  });
}

export const edgeTts: TtsProvider = {
  async speak(text) {
    const voice = config.tts.voice();
    const dir = path.join(config.cacheDir(), "tts");
    fs.mkdirSync(dir, { recursive: true });
    const key = sha(text, voice);
    const audioFile = path.join(dir, `${key}.mp3`);
    const timingFile = path.join(dir, `${key}.json`);
    const cached = fs.existsSync(audioFile) && fs.existsSync(timingFile);

    const start = Date.now();
    if (!cached) {
      await withRetry(`tts ${voice}`, async () => {
        await runPython([path.resolve("scripts/tts.py"), voice, audioFile, timingFile], text);
        if (!fs.existsSync(audioFile) || fs.statSync(audioFile).size === 0) throw new Error("edge-tts wrote no audio");
      });
    }

    const durationSec = await audioDurationSec(audioFile);
    const boundaries = JSON.parse(fs.readFileSync(timingFile, "utf8")) as WordTiming[];
    const hasTimings = boundaries.length > 0;
    return {
      audioFile,
      durationSec,
      words: hasTimings ? boundaries : evenSplit(text, durationSec),
      timingSource: hasTimings ? "edge-tts" : "even-split",
      cached,
      ms: cached ? 0 : Date.now() - start,
    };
  },
};
