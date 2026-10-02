// Local CLI: npm run gen -- "<topic>"   -> out/video.mp4
import path from "node:path";
import { cloudflare } from "../pipeline/cost/pricing";
import { generateVideo, type StageRunner } from "../pipeline/generate";

async function main() {
  const topic = process.argv.slice(2).join(" ").trim();
  if (!topic) {
    console.error('Usage: npm run gen -- "<topic>"');
    process.exit(1);
  }
  const timings: Record<string, number> = {};
  const stage: StageRunner = async (name, fn) => {
    const start = Date.now();
    const { value, summary } = await fn();
    timings[name] = Date.now() - start;
    console.log(`[${name}] ${(timings[name] / 1000).toFixed(1)}s - ${summary}`);
    return value;
  };

  const totalStart = Date.now();
  const result = await generateVideo({ topic, workDir: path.resolve("out"), stage });
  const { images, neurons_est } = result.metrics;

  console.log("\n--- Summary ---");
  console.log(`Video: ${result.videoFile} (${result.durationSec.toFixed(1)}s)`);
  console.log(`Steps: ${Object.entries(timings).map(([k, v]) => `${k} ${(v / 1000).toFixed(1)}s`).join(", ")}`);
  console.log(`Total: ${((Date.now() - totalStart) / 1000).toFixed(1)}s`);
  console.log(
    images
      ? `Images: ${images} new, ~${(neurons_est / images).toFixed(1)} neurons each (estimate), ~${Math.floor(cloudflare.freeNeuronsPerDay / (neurons_est / images))} images per day on the free tier`
      : "Images: all from cache, no neurons used",
  );
}

main().catch((err) => {
  console.error("\nFAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
