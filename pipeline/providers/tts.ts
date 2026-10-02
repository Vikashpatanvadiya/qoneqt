import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { WordTiming } from "../../shared/types";
import { config } from "../config";
import { sha, withRetry } from "../util";
import { resolveTimings } from "./timings";

const execFileAsync = promisify(execFile);

export type TtsOptions = { voice?: string; speedUpPct?: number };

export type TtsResult = {
  audioFile: string;
  durationSec: number; // usable length: ends shortly after the last spoken word
  rawDurationSec: number; // full audio file length, including the trailing silence edge-tts adds
  words: WordTiming[];
  timingSource: string;
  cached: boolean;
  ms: number;
};

export interface TtsProvider {
  name: string;
  speak(text: string, options?: TtsOptions): Promise<TtsResult>;
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

export const edgeTts: TtsProvider = {
  name: "edge-tts",
  async speak(text, options = {}) {
    const voice = options.voice || config.tts.voice();
    const rate = `+${Math.max(0, Math.round(options.speedUpPct ?? 0))}%`;
    const dir = path.join(config.cacheDir(), "tts");
    fs.mkdirSync(dir, { recursive: true });
    const key = sha(text, voice, rate);
    const audioFile = path.join(dir, `${key}.mp3`);
    const timingFile = path.join(dir, `${key}.json`);
    const cached = fs.existsSync(audioFile) && fs.existsSync(timingFile);

    const start = Date.now();
    if (!cached) {
      await withRetry(`tts ${voice}`, async () => {
        await runPython([path.resolve("scripts/tts.py"), voice, audioFile, timingFile, rate], text);
        if (!fs.existsSync(audioFile) || fs.statSync(audioFile).size === 0) throw new Error("edge-tts wrote no audio");
      });
    }

    const rawDurationSec = await audioDurationSec(audioFile);
    const boundaries = JSON.parse(fs.readFileSync(timingFile, "utf8")) as WordTiming[];
    // Real word boundaries tell us where speech ends, so the dead air after it can be cut.
    const lastWordEnd = boundaries.at(-1)?.endSec;
    const durationSec = lastWordEnd ? Math.min(rawDurationSec, lastWordEnd + config.qa.voiceTailSec) : rawDurationSec;
    const { words, source } = await resolveTimings({ text, audioFile, durationSec, boundaries });
    return { audioFile, durationSec, rawDurationSec, words, timingSource: source, cached, ms: cached ? 0 : Date.now() - start };
  },
};
