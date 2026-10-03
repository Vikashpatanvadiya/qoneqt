// Post-process for every AI or stock image, so they look like one shoot instead of separate AI renders:
// a per-theme colour grade, light sharpening, fine grain and a soft vignette, delivered as a 1080x1920 frame.
// Images wider than 3:4 are never stretched or hard-cropped: the sharp image sits centred on a blurred fill of itself.
import { execFileSync } from "node:child_process";

// Keys are legacy theme ids and Style Pack grade names.
const GRADES: Record<string, string> = {
  // cool shadows, slightly lifted contrast
  midnight: "eq=saturation=0.86:contrast=1.06:brightness=-0.015,colorbalance=rs=-0.03:bs=0.05:rh=0.02",
  // warm, soft, a little faded
  paper: "eq=saturation=0.8:contrast=0.97:brightness=0.01,colorbalance=rm=0.04:bm=-0.04:rh=0.03:bh=-0.03",
  // neutral: the duotone is applied in the composition
  neon: "eq=saturation=0.9:contrast=1.08",
  // muted magazine look with warm highlights
  editorial: "eq=saturation=0.78:contrast=1.08,colorbalance=rh=0.04:bh=-0.03:bs=0.03",
  // clean and bright, still below glossy
  pop: "eq=saturation=0.97:contrast=1.05:brightness=0.01",
  // Style Pack grades
  film: "eq=saturation=0.72:contrast=1.08:brightness=-0.02,colorbalance=rs=0.03:bs=-0.02:rh=0.05:bh=-0.04",
  vivid: "eq=saturation=1.08:contrast=1.06:brightness=0.01",
  cool: "eq=saturation=0.82:contrast=1.06,colorbalance=rs=-0.04:bs=0.06:bm=0.03",
  soft: "eq=saturation=0.86:contrast=0.96:brightness=0.03",
  contrast: "eq=saturation=1.02:contrast=1.16",
  mono: "hue=s=0,eq=contrast=1.12:brightness=0.01",
  warm: "eq=saturation=0.84:contrast=0.98:brightness=0.02,colorbalance=rm=0.05:bm=-0.05:rh=0.04:bh=-0.04",
};

const FINISH = "unsharp=5:5:0.35:5:5:0,noise=alls=5:allf=t,vignette=angle=PI/5";

export function gradeImage(input: { inFile: string; outFile: string; theme: string | undefined }) {
  const probe = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", input.inFile]).toString().trim();
  const [w, h] = probe.split(",").map(Number);
  const grade = `${GRADES[input.theme ?? "midnight"] ?? GRADES.midnight},${FINISH}`;
  const wide = w / h > 0.75;
  const filter = wide
    ? // blurred, darkened copy fills the frame; the sharp image sits slightly above centre
      `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=28:2,eq=brightness=-0.12:saturation=0.7[bg];[0:v]scale=1080:-2:flags=lanczos[fg];[bg][fg]overlay=(W-w)/2:(H-h)*0.42,${grade}[out]`
    : `[0:v]scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos,crop=1080:1920,${grade}[out]`;
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", input.inFile, "-filter_complex", filter, "-map", "[out]", "-q:v", "3", input.outFile]);
  return { wide, width: w, height: h };
}

// Prompt suffix that pushes image models towards a documentary photo instead of the glossy AI look.
export const DOCUMENTARY_STYLE =
  "documentary photograph, natural light, 35mm lens, shallow depth of field, subtle film grain, muted natural colors, realistic textures, candid moment, medium or wide shot, no text, no letters, no logos, no watermark";
