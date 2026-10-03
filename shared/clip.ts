// Clipper: a long video in, several short vertical clips out.
// Shared by the pipeline, the Remotion composition and the web app.
import type { WordTiming } from "./types";

export type ClipLayout = "auto" | "face" | "blur" | "split";
export type ClipLength = "short" | "medium" | "long";

export const CLIP_LENGTHS: Record<ClipLength, { min: number; max: number; label: string }> = {
  short: { min: 15, max: 35, label: "15 to 35 s" },
  medium: { min: 30, max: 60, label: "30 to 60 s" },
  long: { min: 45, max: 90, label: "45 to 90 s" },
};

// What the Create page sends as job.options.clip
export type ClipOptions = {
  source: { kind: "url"; url: string } | { kind: "upload"; path: string; name: string };
  layout: ClipLayout;
  count: number;
  length: ClipLength;
  removePauses: boolean;
  captions: boolean;
  rightsConfirmed: true;
};

// Part of the clip file that is kept (pauses removed). Seconds in the clip file.
export type KeepRange = { from: number; to: number };

// Where the vertical crop is centred over time: x in 0..1 of the source width, t in clip-file seconds.
export type CropKey = { t: number; x: number };

export type ClipVideoProps = {
  title: string;
  hook: string;
  // File names inside the render's public dir (or URLs in the browser preview)
  videoFile: string;
  backgroundFile: string | null;
  source: { width: number; height: number };
  layout: Exclude<ClipLayout, "auto">;
  crop: CropKey[];
  keep: KeepRange[];
  // Word timings in OUTPUT seconds (after pauses are removed)
  words: WordTiming[];
  emphasisWords: string[];
  captions: boolean;
  packId: string;
  assetBase?: string;
};

export const CLIP_FPS = 30;

export const keptSeconds = (keep: KeepRange[]) => keep.reduce((n, r) => n + (r.to - r.from), 0);
export const clipFrames = (keep: KeepRange[]) => Math.max(1, Math.round(keptSeconds(keep) * CLIP_FPS));

// Maps an output time to the time in the clip file.
export function sourceTime(keep: KeepRange[], outSec: number): number {
  let acc = 0;
  for (const r of keep) {
    const len = r.to - r.from;
    if (outSec < acc + len) return r.from + (outSec - acc);
    acc += len;
  }
  const last = keep[keep.length - 1];
  return last ? last.to : outSec;
}

// One finished clip, as stored on the job and shown on the Job page.
export type ClipResult = {
  index: number;
  title: string;
  hook: string;
  reason: string;
  score: number;
  startSec: number;
  endSec: number;
  durationSec: number;
  layout: Exclude<ClipLayout, "auto">;
  videoUrl: string;
  thumbUrl: string;
  sizeMb: number;
};
