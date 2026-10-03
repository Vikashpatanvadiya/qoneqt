// Dev tool: render the same props in several Style Packs, without calling any API.
//   npx tsx scripts/pack-preview.ts                      -> stills of every pack: out/packs/<pack>.jpg (one strip per pack)
//   npx tsx scripts/pack-preview.ts --packs a,b --video  -> also out/packs/<pack>.mp4
//   --props <file> --public <dir> pick another render (default out/props.json and out/public)
//   --thumbs                                             -> web-public/packs/<pack>.jpg for the Create page picker
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { PACK_IDS } from "../src/styles/packs";
import { applyPack } from "../pipeline/packs";
import { FPS, type PulseVideoProps } from "../shared/types";

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};

async function main() {
  const propsFile = path.resolve(arg("--props") ?? "out/props.json");
  const publicDir = path.resolve(arg("--public") ?? path.join(path.dirname(propsFile), "public"));
  const packs = (arg("--packs")?.split(",") ?? [...PACK_IDS]) as Array<(typeof PACK_IDS)[number]>;
  const base = JSON.parse(fs.readFileSync(propsFile, "utf8")) as PulseVideoProps;
  const outDir = path.resolve("out/packs");
  fs.mkdirSync(outDir, { recursive: true });
  const serveUrl = await bundle({ entryPoint: path.resolve("remotion/index.ts"), publicDir });

  for (const pack of packs) {
    const start = Date.now();
    const plan = applyPack({ global: base.global, shots: [] }, pack, base.title);
    const inputProps: PulseVideoProps = { ...base, global: plan.global };
    const composition = await selectComposition({ serveUrl, id: "PulseVideo", inputProps });
    const dir = path.join(outDir, pack);
    fs.mkdirSync(dir, { recursive: true });
    const frames: string[] = [];
    let cursor = 0;
    for (const scene of inputProps.scenes) {
      const n = Math.round(scene.durationSec * FPS);
      const file = path.join(dir, `${scene.id}.jpg`);
      await renderStill({ composition, serveUrl, inputProps, frame: cursor + Math.floor(n * 0.6), output: file, imageFormat: "jpeg" });
      frames.push(file);
      cursor += n;
    }
    const outro = path.join(dir, "outro.jpg");
    await renderStill({ composition, serveUrl, inputProps, frame: composition.durationInFrames - 5, output: outro, imageFormat: "jpeg" });
    frames.push(outro);
    // One strip per pack: every scene side by side
    execFileSync("ffmpeg", ["-v", "error", "-y", ...frames.flatMap((f) => ["-i", f]), "-filter_complex", `${frames.map((_, i) => `[${i}:v]scale=270:480[v${i}]`).join(";")};${frames.map((_, i) => `[v${i}]`).join("")}hstack=inputs=${frames.length}`, path.join(outDir, `${pack}.jpg`)]);
    if (process.argv.includes("--thumbs")) {
      const thumbDir = path.resolve("web-public/packs");
      fs.mkdirSync(thumbDir, { recursive: true });
      execFileSync("ffmpeg", ["-v", "error", "-y", "-i", frames[0], "-vf", "scale=270:480", "-q:v", "4", path.join(thumbDir, `${pack}.jpg`)]);
    }
    if (process.argv.includes("--video")) {
      await renderMedia({ composition, serveUrl, codec: "h264", crf: 26, scale: 0.75, outputLocation: path.join(outDir, `${pack}.mp4`), inputProps, concurrency: os.cpus().length });
    }
    console.log(`${pack}: ${((Date.now() - start) / 1000).toFixed(1)}s`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
