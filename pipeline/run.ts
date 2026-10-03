// Entry used by the GitHub Action: npx tsx pipeline/run.ts <job_id>
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEFAULT_COMMUNITY, parseCommunityProfile } from "./agents/community";
import { createStageRunner, getCommunity, getJob, updateJob, uploadFile } from "./db";
import { generateVideo } from "./generate";
import { resolveEngine } from "./providers";
import { InputTypeSchema } from "./schemas";
import { sleep } from "./util";

const JOB_TIMEOUT_MS = 25 * 60 * 1000;

// options.critic = { minOverall, minHook } lets a job raise or lower the bar.
function criticOptions(options: unknown): { minOverall?: number; minHook?: number } {
  const critic = (options as { critic?: Record<string, unknown> } | null)?.critic ?? {};
  const num = (v: unknown) => (typeof v === "number" && v >= 1 && v <= 10 ? v : undefined);
  return { minOverall: num(critic.minOverall), minHook: num(critic.minHook) };
}

async function runJob(jobId: string) {
  const totalStart = Date.now();
  const stageMs: Record<string, number> = {};
  const stage = createStageRunner(jobId, stageMs);

  const { job, community, engine } = await stage("ingest", async () => {
    const row = await getJob(jobId);
    if (!row) throw new Error(`Job ${jobId} not found`);
    await updateJob(jobId, { status: "running", error: null });
    const saved = row.community_id ? await getCommunity(row.community_id) : null;
    const profile = saved ? parseCommunityProfile(saved.name, saved.profile) : DEFAULT_COMMUNITY;
    const resolved = resolveEngine(typeof row.options?.engine === "string" ? row.options.engine : undefined);
    const communityNote = saved ? "Using the saved Community Brain profile." : "No community chosen, using the default Qoneqt profile.";
    return {
      value: { job: row, community: profile, engine: resolved.engine },
      summary: `${row.input_type} for ${profile.name} on ${resolved.engine.label}: ${String(row.input_text).replace(/\s+/g, " ").slice(0, 80)}`,
      reason: [communityNote, resolved.note].filter(Boolean).join(" "),
      output: { community: profile, engine: resolved.engine.name, engineNote: resolved.note ?? null },
    };
  });

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), `pulse-${jobId}-`));
  const inputType = InputTypeSchema.catch("topic").parse(job.input_type);
  const result = await generateVideo({
    inputType,
    content: job.input_text,
    community,
    engine,
    criticThresholds: criticOptions(job.options),
    uploadStill: (file, name) => uploadFile(`${jobId}/stills/${name}`, file, "image/jpeg"),
    debugBreakScene: typeof job.options?.debugBreakScene === "string" ? job.options.debugBreakScene : undefined,
    editStyle: job.options?.editStyle === "classic" ? "classic" : "creator",
    workDir,
    stage,
  });

  const urls = await stage("upload", async () => {
    const videoUrl = await uploadFile(`${jobId}/video.mp4`, result.videoFile, "video/mp4");
    const thumbUrl = await uploadFile(`${jobId}/thumb.jpg`, result.thumbFile, "image/jpeg");
    return { value: { videoUrl, thumbUrl }, summary: "Video and thumbnail uploaded", output: { videoUrl, thumbUrl } };
  });

  await updateJob(jobId, {
    status: "done",
    title: result.title,
    video_url: urls.videoUrl,
    thumb_url: urls.thumbUrl,
    duration_sec: Number(result.durationSec.toFixed(2)),
    scores: result.scores,
    metrics: { ...result.metrics, total_ms: Date.now() - totalStart, stage_ms: stageMs },
  });
  console.log(`\nDone: ${urls.videoUrl}`);
}

async function main() {
  const jobId = process.argv[2];
  if (!jobId) {
    console.error("Usage: npx tsx pipeline/run.ts <job_id>");
    process.exit(1);
  }
  // Batch jobs start a few seconds apart so they do not hit the free LLM rate limit together.
  const delaySec = Math.min(Math.max(Number(process.argv[3] ?? 0) || 0, 0), 600);
  if (delaySec > 0) {
    console.log(`Staggered start: waiting ${delaySec}s`);
    await sleep(delaySec * 1000);
  }
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Job timed out after 25 minutes")), JOB_TIMEOUT_MS);
  });
  try {
    await Promise.race([runJob(jobId), timeout]);
    clearTimeout(timer);
    process.exit(0);
  } catch (err) {
    // Never leave a job stuck in `running`.
    const message = err instanceof Error ? err.message : String(err);
    console.error("\nFAILED:", message);
    await updateJob(jobId, { status: "failed", error: message.slice(0, 1000) }).catch((e) => console.error("Could not mark job failed:", e.message));
    process.exit(1);
  }
}

main();
