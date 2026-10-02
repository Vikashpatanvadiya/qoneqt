// Local CLI: npm run gen -- "<topic>"   -> out/video.mp4
import path from "node:path";
import { DEFAULT_COMMUNITY } from "../pipeline/agents/community";
import { cloudflare } from "../pipeline/cost/pricing";
import { generateVideo, type StageRunner } from "../pipeline/generate";
import { resolveEngine } from "../pipeline/providers";

async function main() {
  const topic = process.argv.slice(2).join(" ").trim();
  if (!topic) {
    console.error('Usage: npm run gen -- "<topic>"');
    process.exit(1);
  }
  const timings: Record<string, number> = {};
  const stage: StageRunner = async (name, fn) => {
    const start = Date.now();
    const { value, summary, reason } = await fn();
    timings[name] = Date.now() - start;
    console.log(`[${name}] ${(timings[name] / 1000).toFixed(1)}s - ${summary}`);
    if (reason) console.log(`  reason: ${reason}`);
    return value;
  };

  const totalStart = Date.now();
  const { engine } = resolveEngine();
  const result = await generateVideo({ inputType: "topic", content: topic, community: DEFAULT_COMMUNITY, engine, workDir: path.resolve("out"), stage });
  const m = result.metrics;

  console.log("\n--- Summary ---");
  console.log(`Video: ${result.videoFile} (${result.durationSec.toFixed(1)}s)`);
  console.log(`Steps: ${Object.entries(timings).map(([k, v]) => `${k} ${(v / 1000).toFixed(1)}s`).join(", ")}`);
  console.log(`Total: ${((Date.now() - totalStart) / 1000).toFixed(1)}s`);
  console.log(`LLM (${m.engine}): ${m.llm_calls} calls, ${m.llm_failures} failed, ${m.rate_limit_hits} rate-limit hits, ${(m.llm_wait_ms / 1000).toFixed(1)}s waiting, ${m.input_tokens} in / ${m.output_tokens} out tokens`);
  console.log(`Script score: v1 ${result.scores.script_v1} -> final ${result.scores.script_final} (${m.script_revisions} revisions)`);
  console.log(`Governor: ${m.governor_actions} actions, over limit: ${m.over_limit}`);
  for (const c of result.qa) console.log(`QA ${c.status.padEnd(7)} ${c.label}: ${c.detail}${c.before ? ` [${c.before} -> ${c.after}]` : ""}`);
  console.log(
    m.images
      ? `Images: ${m.images} new, ~${(m.neurons_est / m.images).toFixed(1)} neurons each (estimate), ~${Math.floor(cloudflare.freeNeuronsPerDay / (m.neurons_est / m.images))} images per day on the free tier`
      : "Images: none generated (cached or designed scenes only)",
  );
}

main().catch((err) => {
  console.error("\nFAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
