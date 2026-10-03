// Sound design, all generated or processed with ffmpeg so there are no licensing questions:
// synthesized SFX, a looping music bed with crossfades, and a light voice polish chain.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config";
import { sha } from "./util";

export type SoundOptions = {
  music: "auto" | "none" | "upbeat" | "calm" | "dramatic" | "inspiring";
  musicTrack?: string; // a specific file name in public/music
  musicLevel: "low" | "medium" | "high";
  ducking: boolean;
  sfx: "off" | "low" | "medium" | "high";
  voice?: string;
  voiceRatePct: number; // -10 to +20
  voicePolish: boolean;
};

export const DEFAULT_SOUND: SoundOptions = { music: "auto", musicLevel: "medium", ducking: true, sfx: "medium", voiceRatePct: 0, voicePolish: true };

// Reads job options.sound, falling back to safe defaults for anything missing or unknown.
export function parseSound(raw: unknown): SoundOptions {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T) => (typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback);
  const rate = Number(o.voiceRatePct);
  return {
    music: pick(o.music, ["auto", "none", "upbeat", "calm", "dramatic", "inspiring"] as const, DEFAULT_SOUND.music),
    musicTrack: typeof o.musicTrack === "string" && /^[\w-]+\.mp3$/.test(o.musicTrack) ? o.musicTrack : undefined,
    musicLevel: pick(o.musicLevel, ["low", "medium", "high"] as const, DEFAULT_SOUND.musicLevel),
    ducking: typeof o.ducking === "boolean" ? o.ducking : DEFAULT_SOUND.ducking,
    sfx: pick(o.sfx, ["off", "low", "medium", "high"] as const, DEFAULT_SOUND.sfx),
    voice: typeof o.voice === "string" && /^[a-z]{2}-[A-Z]{2}-\w+Neural$/.test(o.voice) ? o.voice : undefined,
    voiceRatePct: Number.isFinite(rate) ? Math.max(-10, Math.min(20, Math.round(rate))) : 0,
    voicePolish: typeof o.voicePolish === "boolean" ? o.voicePolish : DEFAULT_SOUND.voicePolish,
  };
}

const ffmpeg = (args: string[]) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args]);
const durationOf = (file: string) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim());

// ---------- Sound effects ----------

const SFX: Record<string, string> = {
  // filtered noise swept up and down: a soft whoosh for transitions
  whoosh: "anoisesrc=d=0.45:c=pink:a=0.9,highpass=f=300,lowpass=f=5000,afade=t=in:d=0.18,afade=t=out:st=0.2:d=0.25,volume=0.8",
  // short pitch-dropping blip for caption emphasis
  pop: "aevalsrc='0.9*sin(2*PI*t*(900-4000*t))*exp(-45*t)':d=0.09:s=48000",
  // rising tone and noise that leads into a hit
  riser: "aevalsrc='0.35*sin(2*PI*t*(180+900*t*t))*t+0.15*(random(0)-0.5)*t':d=0.9:s=48000,highpass=f=120,afade=t=in:d=0.5",
  // low boom for the hook and the twist
  hit: "aevalsrc='0.9*sin(2*PI*52*t)*exp(-5*t)+0.35*sin(2*PI*104*t)*exp(-9*t)+0.2*(random(0)-0.5)*exp(-30*t)':d=0.7:s=48000",
  // quick clicks under a counting number
  tick: "aevalsrc='0.7*sin(2*PI*2600*mod(t,0.1))*exp(-90*mod(t,0.1))':d=0.8:s=48000",
};

// Writes the SFX into the render's public dir (cached across jobs). Returns the file names.
export function prepareSfx(publicDir: string): Record<string, string> {
  const cache = path.join(config.cacheDir(), "sfx");
  fs.mkdirSync(cache, { recursive: true });
  const out: Record<string, string> = {};
  for (const [name, filter] of Object.entries(SFX)) {
    const cached = path.join(cache, `${name}-${sha(filter).slice(0, 8)}.wav`);
    if (!fs.existsSync(cached)) ffmpeg(["-f", "lavfi", "-i", filter, "-ac", "2", "-ar", "48000", cached]);
    fs.copyFileSync(cached, path.join(publicDir, `sfx-${name}.wav`));
    out[name] = `sfx-${name}.wav`;
  }
  return out;
}

// ---------- Music bed ----------

const TRACKS: Record<string, string[]> = {
  upbeat: ["upbeat.mp3", "inspiring_1.mp3"],
  inspiring: ["inspiring.mp3", "inspiring_2.mp3"],
  calm: ["calm.mp3"],
  dramatic: ["dramatic.mp3"],
};

export function availableTracks(): string[] {
  const dir = path.resolve("public/music");
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".mp3")) : [];
}

// Builds a bed exactly as long as the video: random start, crossfaded loops (no audible 10 s repeat), fade in and out.
export function buildMusicBed(input: { mood: string; sound: SoundOptions; durationSec: number; seed: string; publicDir: string }): { file: string; track: string } | null {
  if (input.sound.music === "none") return null;
  const mood = input.sound.music === "auto" ? input.mood : input.sound.music;
  const have = new Set(availableTracks());
  const choices = input.sound.musicTrack && have.has(input.sound.musicTrack) ? [input.sound.musicTrack] : (TRACKS[mood] ?? []).filter((t) => have.has(t));
  if (choices.length === 0) return null;
  const pickIndex = parseInt(sha(input.seed).slice(0, 6), 16);
  const track = choices[pickIndex % choices.length];
  const src = path.resolve("public/music", track);
  const trackSec = durationOf(src);
  const need = input.durationSec + 0.5;
  const fade = Math.min(1.5, trackSec / 4);
  // Start somewhere in the first 60% of the track, so videos do not all open the same way.
  const offset = trackSec > need + 4 ? ((pickIndex % 1000) / 1000) * Math.min(trackSec - need, trackSec * 0.6) : 0;

  const out = path.join(input.publicDir, "music-bed.m4a");
  const loops = Math.max(1, Math.ceil((need + offset) / Math.max(1, trackSec - fade)) );
  const args: string[] = [];
  for (let i = 0; i < loops; i++) args.push("-i", src);
  // Chain the copies with acrossfade, then trim to length and fade the ends.
  let chain = "";
  let last = "[0:a]";
  for (let i = 1; i < loops; i++) {
    chain += `${last}[${i}:a]acrossfade=d=${fade.toFixed(2)}:c1=tri:c2=tri[x${i}];`;
    last = `[x${i}]`;
  }
  chain += `${last}atrim=start=${offset.toFixed(2)}:duration=${need.toFixed(2)},asetpts=PTS-STARTPTS,afade=t=in:d=0.6,afade=t=out:st=${Math.max(0, need - 1.4).toFixed(2)}:d=1.4[out]`;
  ffmpeg([...args, "-filter_complex", chain, "-map", "[out]", "-ac", "2", "-ar", "48000", "-c:a", "aac", "-b:a", "160k", out]);
  return { file: "music-bed.m4a", track };
}

// ---------- Voice ----------

// Speech-friendly text: symbols and short forms read the way a person would say them.
export function normalizeForSpeech(text: string): string {
  return text
    .replace(/₹\s?([\d,]+(?:\.\d+)?)(?:\s?(k|K|L|lakh|cr|crore)\b)?/g, (_m, n: string, unit?: string) => `${n} ${unit ? ({ k: "thousand", K: "thousand", L: "lakh", lakh: "lakh", cr: "crore", crore: "crore" } as Record<string, string>)[unit] + " " : ""}rupees`)
    .replace(/\$\s?([\d,]+(?:\.\d+)?)/g, "$1 dollars")
    .replace(/(\d)\s?%/g, "$1 percent")
    .replace(/\s&\s/g, " and ")
    .replace(/\bvs\.?\b/gi, "versus")
    .replace(/\be\.g\.\s?/gi, "for example ")
    .replace(/\bi\.e\.\s?/gi, "that is ")
    .replace(/\betc\.?/gi, "and so on")
    .replace(/(\d+)k\b/g, "$1 thousand")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Light broadcast chain: high-pass at 80 Hz, de-ess, gentle compression, a little presence, very low room tone.
export function polishVoice(inFile: string, outFile: string) {
  ffmpeg([
    "-i", inFile,
    "-f", "lavfi", "-i", "anoisesrc=c=brown:a=0.0015:d=600",
    "-filter_complex",
    "[0:a]highpass=f=80,deesser=i=0.4,acompressor=threshold=-20dB:ratio=2.5:attack=8:release=120:makeup=2,equalizer=f=3200:t=q:w=1.2:g=2[v];[v][1:a]amix=inputs=2:duration=first:normalize=0[out]",
    "-map", "[out]", "-ac", "1", "-ar", "48000", "-c:a", "libmp3lame", "-q:a", "3", outFile,
  ]);
}

export const sfxVolume = (level: SoundOptions["sfx"]) => ({ off: 0, low: 0.18, medium: 0.3, high: 0.45 })[level];
export const musicVolume = (level: SoundOptions["musicLevel"]) => ({ low: 0.14, medium: 0.22, high: 0.32 })[level];
