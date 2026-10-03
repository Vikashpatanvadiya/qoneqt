// Dev tool: run the Clipper on the laptop, without Supabase jobs.
//   npx tsx scripts/clip.ts <file-or-link> [count] [layout auto|face|blur|split] [length short|medium|long] [stylePack]
// Clips land in out/clips/.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateClips } from "../pipeline/clipper";
import type { StageRunner } from "../pipeline/generate";
import { resolveEngine } from "../pipeline/providers";
import type { ClipLayout, ClipLength } from "../shared/clip";

async function main() {
  const [src, count = "3", layout = "auto", length = "short", pack] = process.argv.slice(2);
  if (!src) throw new Error("Usage: npx tsx scripts/clip.ts <file-or-link> [count] [layout] [length] [stylePack]");
  const url = /^https?:/.test(src) ? src : `file://${path.resolve(src)}`;
  const stage: StageRunner = async (name, fn) => {
    const start = Date.now();
    const r = await fn();
    console.log(`[${name}] ${((Date.now() - start) / 1000).toFixed(1)}s - ${r.summary}${r.reason ? `\n    ${r.reason.slice(0, 600)}` : ""}`);
    return r.value;
  };
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-clip-"));
  const result = await generateClips({ options: { source: { kind: "url", url }, layout: layout as ClipLayout, count: Number(count), length: length as ClipLength, removePauses: true, captions: true, rightsConfirmed: true }, engine: resolveEngine("gemini").engine, stylePack: pack, workDir, stage });
  const outDir = path.resolve("out/clips");
  fs.mkdirSync(outDir, { recursive: true });
  for (const c of result.clips) {
    fs.copyFileSync(c.videoFile, path.join(outDir, `${c.index}.mp4`));
    fs.copyFileSync(c.thumbFile, path.join(outDir, `${c.index}.jpg`));
    console.log(`clip ${c.index}: "${c.idea.title}" ${c.startSec.toFixed(1)}-${c.endSec.toFixed(1)}s -> ${c.durationSec.toFixed(1)}s, ${c.layout}, ${c.sizeMb} MB, score ${c.idea.score}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
