// Dev tool: re-render out/props.json without calling any API. Use it to iterate on the Remotion design.
//   npx tsx scripts/rerender.ts            -> out/video.mp4
//   npx tsx scripts/rerender.ts --stills   -> out/stills/<scene>.jpg (middle frame of each scene) + outro.jpg
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { config } from "../pipeline/config";
import { qaVideo } from "../pipeline/qa";
import { FPS, type PulseVideoProps } from "../shared/types";

async function main() {
  const outDir = path.resolve("out");
  const inputProps = JSON.parse(fs.readFileSync(path.join(outDir, "props.json"), "utf8")) as PulseVideoProps;
  const serveUrl = await bundle({ entryPoint: path.resolve("remotion/index.ts"), publicDir: path.join(outDir, "public") });
  const composition = await selectComposition({ serveUrl, id: "PulseVideo", inputProps });
  const start = Date.now();

  if (process.argv.includes("--stills")) {
    const dir = path.join(outDir, "stills");
    fs.mkdirSync(dir, { recursive: true });
    let cursor = 0;
    for (const scene of inputProps.scenes) {
      const frames = Math.round(scene.durationSec * FPS);
      await renderStill({ composition, serveUrl, inputProps, frame: cursor + Math.floor(frames * 0.55), output: path.join(dir, `${scene.id}.jpg`), imageFormat: "jpeg" });
      cursor += frames;
    }
    await renderStill({ composition, serveUrl, inputProps, frame: composition.durationInFrames - 5, output: path.join(dir, "outro.jpg"), imageFormat: "jpeg" });
    console.log(`Stills in ${dir} (${((Date.now() - start) / 1000).toFixed(1)}s)`);
    return;
  }

  const outputLocation = path.join(outDir, "video.mp4");
  await renderMedia({ composition, serveUrl, codec: "h264", crf: config.render.crf(), scale: config.render.scale(), outputLocation, inputProps, concurrency: os.cpus().length });
  // Same finishing pass as the real pipeline, so the audio level matches what gets published.
  for (const c of qaVideo(outputLocation, composition.durationInFrames / FPS).checks) console.log(`QA ${c.status.padEnd(7)} ${c.label}${c.before ? `: ${c.before} -> ${c.after}` : ""}`);
  console.log(`${outputLocation}: ${(fs.statSync(outputLocation).size / 1024 / 1024).toFixed(1)} MB in ${((Date.now() - start) / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
