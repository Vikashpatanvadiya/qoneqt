// Code QA gate. No LLM: every check is measured, and every fix is recorded with before and after values.
// Part 1 (qaScenes) runs on the scene data before rendering. Part 2 (qaVideo) runs on the finished mp4.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { CAPTION_LAYOUT, FRAME, HIGH_CONTRAST_BACKING_ALPHA, SAFE_ZONE, fitText, groupWords, scrimAlphaAt, titleBox, type TitleKind } from "../shared/layout";
import type { RenderScene } from "../shared/types";
import { config } from "./config";

export type QaStatus = "pass" | "fixed" | "flagged";

export type QaCheck = {
  id: "duration" | "words_per_scene" | "title_overflow" | "caption_overflow" | "safe_zones" | "text_contrast" | "file_size" | "loudness" | "silences" | "black_frames";
  label: string;
  status: QaStatus;
  detail: string;
  before?: string;
  after?: string;
};

const worst = (statuses: QaStatus[]): QaStatus => (statuses.includes("flagged") ? "flagged" : statuses.includes("fixed") ? "fixed" : "pass");
const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

const titleKind = (scene: RenderScene): TitleKind => (scene.layout === "full_image" && scene.imageFile ? "image" : scene.layout === "stat_card" && scene.statValue ? "stat" : "card");

// ---------- Part 1: scene data ----------

// Brightest part of a horizontal band of the frame, as 0..255, measured on the source image.
function bandBrightness(imageFile: string, fromPct: number, toPct: number): number {
  const probe = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", imageFile]).toString();
  const [w, h] = probe.trim().split(",").map(Number);
  // The image is drawn with object-fit: cover, so only the centre part is visible.
  const scale = Math.max(FRAME.width / w, FRAME.height / h);
  const visW = FRAME.width / scale;
  const visH = FRAME.height / scale;
  const crop = [Math.floor(visW), Math.max(2, Math.floor((visH * (toPct - fromPct)) / 100)), Math.floor((w - visW) / 2), Math.floor((h - visH) / 2 + (visH * fromPct) / 100)];
  const raw = execFileSync("ffmpeg", ["-v", "error", "-i", imageFile, "-vf", `crop=${crop.join(":")},scale=8:4:flags=area`, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "-"]);
  const cells = [...raw].sort((a, b) => b - a);
  const top = cells.slice(0, Math.max(1, Math.floor(cells.length / 4)));
  return top.reduce((n, v) => n + v, 0) / top.length;
}

// WCAG contrast of white text on a background of the given brightness (0..255) under a black overlay.
function whiteContrast(brightness: number, overlayAlpha: number): number {
  const luminance = ((brightness * (1 - overlayAlpha)) / 255) ** 2.2;
  return 1.05 / (luminance + 0.05);
}

export function qaScenes(input: { scenes: RenderScene[]; publicDir: string }): { scenes: RenderScene[]; checks: QaCheck[] } {
  const { publicDir } = input;
  const limit = config.video.maxSec();
  const totalSec = input.scenes.reduce((n, s) => n + s.durationSec, 0) + config.video.outroSec;
  const checks: QaCheck[] = [];

  checks.push({
    id: "duration",
    label: "Total duration",
    status: totalSec <= limit + 0.5 ? "pass" : "flagged",
    detail: `${totalSec.toFixed(1)}s including the ${config.video.outroSec}s outro. Limit ${limit}s.`,
  });

  const longScenes = input.scenes.filter((s) => wordCount(s.narration) > config.video.hardMaxWordsPerScene);
  checks.push({
    id: "words_per_scene",
    label: "Words per scene",
    status: longScenes.length ? "flagged" : "pass",
    detail: longScenes.length
      ? `Over ${config.video.hardMaxWordsPerScene} words: ${longScenes.map((s) => `${s.id} (${wordCount(s.narration)})`).join(", ")}`
      : `Longest scene is ${Math.max(...input.scenes.map((s) => wordCount(s.narration)))} words. Cap ${config.video.hardMaxWordsPerScene}.`,
  });

  const title: { status: QaStatus; notes: string[] } = { status: "pass", notes: [] };
  const caption: { status: QaStatus; notes: string[] } = { status: "pass", notes: [] };
  const safe: { status: QaStatus; notes: string[] } = { status: "pass", notes: [] };
  const contrast: { status: QaStatus; notes: string[]; before: number[]; after: number[] } = { status: "pass", notes: [], before: [], after: [] };

  const captionBottomPx = FRAME.height * (1 - CAPTION_LAYOUT.bottomPct / 100);
  const captionWidth = FRAME.width - CAPTION_LAYOUT.sidePad * 2;

  const scenes = input.scenes.map((scene, index) => {
    const fixed: RenderScene = { ...scene };

    // On-screen text must fit its box. If not, the font shrinks until it does.
    const box = titleBox(titleKind(scene), index === 0);
    const titleFit = fitText(scene.onScreenText, box);
    if (titleFit.fontSize < box.fontSize) {
      fixed.titleFontSize = titleFit.fontSize;
      title.notes.push(`${scene.id}: ${box.fontSize}px -> ${titleFit.fontSize}px${titleFit.fits ? "" : " (still too long)"}`);
      title.status = worst([title.status, titleFit.fits ? "fixed" : "flagged"]);
    }

    // Each caption group (a few words) must fit in two lines.
    let captionSize = CAPTION_LAYOUT.fontSize;
    let captionLines = 1;
    let captionFits = true;
    for (const words of groupWords(scene.words)) {
      const group = words.map((w) => w.word).join(" ");
      const fit = fitText(group, {
        maxWidth: captionWidth,
        maxHeight: CAPTION_LAYOUT.maxLines * captionSize * CAPTION_LAYOUT.lineHeight,
        fontSize: captionSize,
        minFontSize: CAPTION_LAYOUT.minFontSize,
        lineHeight: CAPTION_LAYOUT.lineHeight,
        gap: CAPTION_LAYOUT.wordGap,
      });
      captionSize = Math.min(captionSize, fit.fontSize);
      captionLines = Math.max(captionLines, Math.min(fit.lines, CAPTION_LAYOUT.maxLines));
      captionFits = captionFits && fit.fits;
    }
    if (captionSize < CAPTION_LAYOUT.fontSize) {
      fixed.captionFontSize = captionSize;
      caption.notes.push(`${scene.id}: ${CAPTION_LAYOUT.fontSize}px -> ${captionSize}px${captionFits ? "" : " (still too wide)"}`);
      caption.status = worst([caption.status, captionFits ? "fixed" : "flagged"]);
    }

    // Safe zones: text stays below the top 10% and above the bottom 20%, and the two blocks do not touch.
    const titleBottomPx = box.topPx + (titleKind(scene) === "image" ? titleFit.heightPx : box.maxHeight);
    const captionTopPx = captionBottomPx - captionLines * captionSize * CAPTION_LAYOUT.lineHeight;
    const problems = [
      box.topPx < (FRAME.height * SAFE_ZONE.topPct) / 100 && "text enters the top safe zone",
      captionBottomPx > FRAME.height * (1 - SAFE_ZONE.bottomPct / 100) && "captions enter the bottom safe zone",
      titleBottomPx > captionTopPx && "on-screen text overlaps the captions",
    ].filter(Boolean);
    if (problems.length) {
      safe.status = "flagged";
      safe.notes.push(`${scene.id}: ${problems.join(", ")}`);
    }

    // Contrast: white text over a bright part of the image is unreadable. Fix: dark backing behind the text.
    if (titleKind(scene) === "image" && scene.imageFile) {
      try {
        const file = path.join(publicDir, scene.imageFile);
        const titleFrom = (box.topPx / FRAME.height) * 100;
        const titleTo = (titleBottomPx / FRAME.height) * 100;
        const captionFrom = (captionTopPx / FRAME.height) * 100;
        const captionTo = (captionBottomPx / FRAME.height) * 100;
        const bands = [
          { from: titleFrom, to: titleTo },
          { from: captionFrom, to: captionTo },
        ];
        const before = Math.min(...bands.map((b) => whiteContrast(bandBrightness(file, b.from, b.to), scrimAlphaAt((b.from + b.to) / 2))));
        contrast.before.push(before);
        if (before < config.qa.minContrast) {
          const after = Math.min(...bands.map((b) => whiteContrast(bandBrightness(file, b.from, b.to), 1 - (1 - scrimAlphaAt((b.from + b.to) / 2)) * (1 - HIGH_CONTRAST_BACKING_ALPHA))));
          fixed.highContrast = true;
          contrast.after.push(after);
          contrast.status = worst([contrast.status, after >= config.qa.minContrast ? "fixed" : "flagged"]);
          contrast.notes.push(`${scene.id}: ${before.toFixed(1)}:1 -> ${after.toFixed(1)}:1 with dark backing`);
        } else {
          contrast.after.push(before);
        }
      } catch (err) {
        contrast.notes.push(`${scene.id}: could not measure (${(err as Error).message.slice(0, 80)})`);
      }
    }
    return fixed;
  });

  checks.push({ id: "title_overflow", label: "On-screen text fits", status: title.status, detail: title.notes.join("; ") || "All on-screen text fits at full size." });
  checks.push({ id: "caption_overflow", label: "Captions fit", status: caption.status, detail: caption.notes.join("; ") || "All caption groups fit in two lines at full size." });
  checks.push({ id: "safe_zones", label: "Safe zones", status: safe.status, detail: safe.notes.join("; ") || `No text in the top ${SAFE_ZONE.topPct}% or bottom ${SAFE_ZONE.bottomPct}%, and no overlap.` });
  const fmt = (values: number[]) => (values.length ? `${Math.min(...values).toFixed(1)}:1 lowest` : undefined);
  checks.push({
    id: "text_contrast",
    label: "Text contrast on images",
    status: contrast.status,
    detail: contrast.notes.join("; ") || (contrast.before.length ? `All image scenes are at least ${config.qa.minContrast}:1.` : "No image scenes to check."),
    before: fmt(contrast.before),
    after: fmt(contrast.after),
  });

  return { scenes, checks };
}

// ---------- Part 2: finished video ----------

type Analysis = {
  lufs: number;
  truePeak: number;
  loudnorm: Record<string, string>;
  silences: Array<{ startSec: number; durationSec: number }>;
  blackFrames: Array<{ startSec: number; durationSec: number }>;
};

function analyze(file: string, withVideo: boolean): Analysis {
  const audio = `silencedetect=noise=-40dB:d=${config.qa.maxSilenceSec},loudnorm=I=${config.qa.targetLufs}:TP=-1.5:LRA=11:print_format=json`;
  const args = ["-hide_banner", "-nostats", "-i", file, ...(withVideo ? ["-vf", "blackdetect=d=0.4:pix_th=0.10"] : ["-vn"]), "-af", audio, "-f", "null", "-"];
  const log = spawnSync("ffmpeg", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }).stderr ?? "";

  const json = log.slice(log.lastIndexOf("{"), log.lastIndexOf("}") + 1);
  const loudnorm = JSON.parse(json) as Record<string, string>;
  const silences = [...log.matchAll(/silence_end: ([\d.]+) \| silence_duration: ([\d.]+)/g)].map((m) => ({ startSec: Number(m[1]) - Number(m[2]), durationSec: Number(m[2]) }));
  const blackFrames = [...log.matchAll(/black_start:([\d.]+) black_end:[\d.]+ black_duration:([\d.]+)/g)].map((m) => ({ startSec: Number(m[1]), durationSec: Number(m[2]) }));
  return { lufs: Number(loudnorm.input_i), truePeak: Number(loudnorm.input_tp), loudnorm, silences, blackFrames };
}

const sizeMb = (file: string) => fs.statSync(file).size / 1024 / 1024;

// Checks the finished mp4. Loudness and file size are fixed by re-encoding in place.
export function qaVideo(videoFile: string, durationSec: number): { checks: QaCheck[]; reencoded: boolean } {
  const { maxFileMb, targetLufs, lufsTolerance, maxTruePeakDb } = config.qa;
  const before = analyze(videoFile, true);
  // The outro has no voice by design, so quiet music there is not a fault.
  before.silences = before.silences.filter((s) => s.startSec < durationSec - config.video.outroSec - 0.5);
  const beforeMb = sizeMb(videoFile);

  const loudnessOff = Math.abs(before.lufs - targetLufs) > lufsTolerance || before.truePeak > maxTruePeakDb;
  const tooBig = beforeMb > maxFileMb;
  let after = before;
  let afterMb = beforeMb;

  if (loudnessOff || tooBig) {
    const m = before.loudnorm;
    const filter = `loudnorm=I=${targetLufs}:TP=-1.5:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
    const out = `${videoFile}.qa.mp4`;
    const video = tooBig ? ["-c:v", "libx264", "-crf", String(config.render.crf() + 5), "-preset", "medium", "-pix_fmt", "yuv420p"] : ["-c:v", "copy"];
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", videoFile, ...video, "-af", filter, "-ar", "48000", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out]);
    fs.renameSync(out, videoFile);
    after = analyze(videoFile, false);
    afterMb = sizeMb(videoFile);
  }

  const loudnessOk = Math.abs(after.lufs - targetLufs) <= lufsTolerance + 0.5 && after.truePeak <= maxTruePeakDb + 0.5;
  const describe = (list: Array<{ startSec: number; durationSec: number }>) => list.map((s) => `${s.durationSec.toFixed(1)}s at ${s.startSec.toFixed(1)}s`).join(", ");

  const checks: QaCheck[] = [
    {
      id: "loudness",
      label: "Loudness",
      status: !loudnessOff ? "pass" : loudnessOk ? "fixed" : "flagged",
      detail: loudnessOff ? `Normalised to the ${targetLufs} LUFS target.` : `Within ${lufsTolerance} LU of the ${targetLufs} LUFS target.`,
      before: `${before.lufs.toFixed(1)} LUFS, peak ${before.truePeak.toFixed(1)} dB`,
      after: `${after.lufs.toFixed(1)} LUFS, peak ${after.truePeak.toFixed(1)} dB`,
    },
    {
      id: "file_size",
      label: "File size",
      status: !tooBig ? "pass" : afterMb <= maxFileMb ? "fixed" : "flagged",
      detail: tooBig ? `Re-encoded to get under ${maxFileMb} MB.` : `Under the ${maxFileMb} MB limit.`,
      before: `${beforeMb.toFixed(1)} MB`,
      after: `${afterMb.toFixed(1)} MB`,
    },
    {
      id: "silences",
      label: "Long silences",
      status: before.silences.length ? "flagged" : "pass",
      detail: before.silences.length ? `Silence longer than ${config.qa.maxSilenceSec}s: ${describe(before.silences)}` : `No silence longer than ${config.qa.maxSilenceSec}s.`,
    },
    {
      id: "black_frames",
      label: "Black frames",
      status: before.blackFrames.length ? "flagged" : "pass",
      detail: before.blackFrames.length ? `Black frames: ${describe(before.blackFrames)}` : "No black frames.",
    },
  ];
  return { checks, reencoded: loudnessOff || tooBig };
}

export const summarizeChecks = (checks: QaCheck[]) => ({
  passed: checks.filter((c) => c.status === "pass").length,
  fixed: checks.filter((c) => c.status === "fixed").length,
  flagged: checks.filter((c) => c.status === "flagged").length,
});
