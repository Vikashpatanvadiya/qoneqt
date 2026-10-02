// The Pulse Engine pipeline: Researcher -> Scriptwriter -> Director -> assets -> Remotion render.
// Used by the local CLI (scripts/gen.ts) and by the GitHub Action (pipeline/run.ts).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import type { PulseVideoProps, RenderScene } from "../shared/types";
import { normalizeShotPlan, runDirector } from "./agents/director";
import { runResearcher } from "./agents/researcher";
import { judge, runScriptCritic, type CriticThresholds } from "./agents/scriptCritic";
import { runScriptRevision, runScriptwriter } from "./agents/scriptwriter";
import { config } from "./config";
import { fluxNeurons } from "./cost/pricing";
import { budgetSec, governScript, governTimeline, type GovernorAction } from "./governor";
import type { Engine } from "./providers";
import { LlmError, summarizeAttempts, type LlmAttempt } from "./providers/llm";
import { qaScenes, qaVideo, summarizeChecks, type QaCheck } from "./qa";
import type { TtsResult } from "./providers/tts";
import { scriptWordCount, type CommunityProfile, type InputType, type Script, type ScriptVersion } from "./schemas";
import { mapLimit } from "./util";

export type StageName = "ingest" | "research" | "script" | "script_critic" | "direct" | "assets" | "vision_critic" | "render" | "qa" | "upload";

// `status` defaults to "done". "fixed" means the stage caught a problem and repaired it, "skipped" means it could not run.
export type StageResult<T> = { value: T; summary: string; reason?: string; output?: unknown; retries?: number; status?: "done" | "fixed" | "skipped" };

// Wraps a stage so the caller decides where progress goes (console, Supabase).
export type StageRunner = <T>(name: StageName, fn: () => Promise<StageResult<T>>) => Promise<T>;

export type GenerateInput = {
  inputType: InputType;
  content: string;
  community: CommunityProfile;
  engine: Engine;
  criticThresholds?: Partial<CriticThresholds>;
  workDir: string;
  stage: StageRunner;
};

export type GenerateResult = {
  title: string;
  script: Script;
  videoFile: string;
  thumbFile: string;
  durationSec: number;
  scores: { script_v1: number | null; script_final: number | null };
  qa: QaCheck[];
  metrics: {
    engine: string;
    llm_calls: number;
    llm_failures: number;
    rate_limit_hits: number;
    daily_quota_hits: number;
    llm_wait_ms: number;
    input_tokens: number;
    output_tokens: number;
    images: number;
    images_cached: number;
    fallbacks: number;
    neurons_est: number;
    governor_actions: number;
    over_limit: boolean;
    script_revisions: number;
    qa_fixed: number;
    qa_flagged: number;
    fixes: number; // everything the engine repaired on its own: script revisions, governor actions, QA fixes
  };
};

function imageSize(file: string): { width: number; height: number } {
  const out = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file]).toString();
  const [width, height] = out.trim().split(",").map(Number);
  return { width, height };
}

export async function generateVideo(input: GenerateInput): Promise<GenerateResult> {
  const { inputType, content, community, engine, workDir, stage } = input;
  const publicDir = path.join(workDir, "public");
  fs.rmSync(publicDir, { recursive: true, force: true });
  fs.mkdirSync(publicDir, { recursive: true });
  const metrics: GenerateResult["metrics"] = {
    engine: engine.name,
    llm_calls: 0,
    llm_failures: 0,
    rate_limit_hits: 0,
    daily_quota_hits: 0,
    llm_wait_ms: 0,
    input_tokens: 0,
    output_tokens: 0,
    images: 0,
    images_cached: 0,
    fallbacks: 0,
    neurons_est: 0,
    governor_actions: 0,
    over_limit: false,
    script_revisions: 0,
    qa_fixed: 0,
    qa_flagged: 0,
    fixes: 0,
  };

  // Adds the call's attempts to the job metrics and returns what the stage row should store.
  const trackAttempts = (attempts: LlmAttempt[]) => {
    const s = summarizeAttempts(attempts);
    metrics.llm_calls += s.calls;
    metrics.llm_failures += s.failed;
    metrics.rate_limit_hits += s.rateLimitHits;
    metrics.llm_wait_ms += s.waitMs;
    metrics.input_tokens += s.inputTokens;
    metrics.output_tokens += s.outputTokens;
    metrics.daily_quota_hits += s.dailyQuotaHits;
    return { attempts, rate_limited: s.rateLimitHits > 0, daily_quota_hit: s.dailyQuotaHits > 0, wait_ms: s.waitMs, retries: s.failed };
  };
  const track = (res: { model: string; attempts: LlmAttempt[] }) => ({ model: res.model, ...trackAttempts(res.attempts) });

  const research = await stage("research", async () => {
    const res = await runResearcher(engine.llm, { inputType, content, communityProfile: community });
    const chosen = res.data.angles[res.data.chosenIndex];
    const { retries, ...llm } = track(res);
    return { value: res.data, summary: `Angle: ${chosen.title} (${chosen.targetEmotion})`, reason: res.data.reason, output: { research: res.data, ...llm }, retries };
  });

  const draft = await stage("script", async () => {
    const res = await runScriptwriter(engine.llm, { content, research, communityProfile: community });
    const governed = governScript(res.data);
    metrics.governor_actions += governed.actions.length;
    const { retries, ...llm } = track(res);
    const wordCount = scriptWordCount(governed.script);
    const fixes = governed.actions.length ? ` Governor: ${governed.actions.length} fix${governed.actions.length > 1 ? "es" : ""}.` : "";
    return {
      value: governed.script,
      summary: `"${governed.script.title}": ${governed.script.scenes.length} scenes, ${wordCount} words, about ${governed.estimatedSec.toFixed(0)}s.${fixes} Hook: ${governed.script.hook}`,
      reason: `Ends with the question: ${governed.script.cta}`,
      output: {
        versions: [{ version: 1, script: governed.script, wordCount }],
        governor: { limitSec: config.video.maxSec(), budgetSec: governed.budgetSec, estimatedSec: governed.estimatedSec, actions: governed.actions },
        ...(governed.actions.length ? { scriptBeforeGovernor: res.data } : {}),
        ...llm,
      },
      retries,
    };
  });

  // Script Critic loop: score, revise up to twice, keep the best version. Every version is saved for the UI.
  const thresholds: CriticThresholds = {
    minOverall: input.criticThresholds?.minOverall ?? config.critic.minOverall(),
    minHook: input.criticThresholds?.minHook ?? config.critic.minHook(),
  };
  const scores: GenerateResult["scores"] = { script_v1: null, script_final: null };

  const script = await stage("script_critic", async () => {
    const versions: ScriptVersion[] = [];
    const attempts: LlmAttempt[] = [];
    let current = draft;
    let stoppedBy: string | null = null;

    for (let version = 1; version <= 1 + config.critic.maxRevisions; version++) {
      try {
        const res = await runScriptCritic(engine.llm, { script: current, communityProfile: community });
        attempts.push(...res.attempts);
        const verdict = judge(res.data, thresholds);
        versions.push({ version, script: current, wordCount: scriptWordCount(current), critique: res.data, overall: verdict.overall, passed: verdict.passed });
        if (verdict.passed || version > config.critic.maxRevisions) break;

        const revised = await runScriptRevision(engine.llm, { script: current, critique: res.data, communityProfile: community });
        attempts.push(...revised.attempts);
        const governed = governScript(revised.data);
        metrics.governor_actions += governed.actions.length;
        current = governed.script;
      } catch (err) {
        // The critic is a quality step, not a blocker: keep the best script so far and move on.
        if (err instanceof LlmError) attempts.push(...err.attempts);
        stoppedBy = (err as Error).message.slice(0, 200);
        console.warn(`  [script_critic] stopped early: ${stoppedBy}`);
        break;
      }
    }

    const llm = trackAttempts(attempts);
    if (versions.length === 0) {
      return { value: draft, status: "skipped" as const, summary: "Script check skipped, using the first draft", reason: stoppedBy ?? "The critic was not available", output: { versions: [], thresholds, ...llm }, retries: llm.retries };
    }

    // Keep the best-scoring version even if none pass. On a tie the later version wins.
    const best = versions.reduce((a, b) => ((b.overall ?? 0) >= (a.overall ?? 0) ? b : a));
    const first = versions[0];
    scores.script_v1 = first.overall;
    scores.script_final = best.overall;
    metrics.script_revisions = versions.length - 1;

    const trail = versions.map((v) => `v${v.version} ${v.overall}`).join(" -> ");
    const hookChanged = best.script.hook !== first.script.hook;
    const topIssue = first.critique?.issues[0];
    return {
      value: best.script,
      status: best.version > 1 ? ("fixed" as const) : ("done" as const),
      summary: `${trail}. ${best.passed ? "Passed" : "Best version kept, below the bar"} (need ${thresholds.minOverall} overall, ${thresholds.minHook} hook).${best.version > 1 ? ` Using v${best.version}.` : ""}${hookChanged ? ` New hook: ${best.script.hook}` : ""}`,
      reason: best.version > 1 && topIssue ? `v1 problem (${topIssue.sceneId}): ${topIssue.problem}` : best.passed ? "The first draft met the bar" : (stoppedBy ?? "No revision scored higher"),
      output: { versions, chosenVersion: best.version, thresholds, stoppedBy, ...llm },
      retries: llm.retries,
    };
  });

  const plan = await stage("direct", async () => {
    const res = await runDirector(engine.llm, { script, communityProfile: community });
    const { plan, repairs } = normalizeShotPlan(res.data, script);
    const layouts = plan.shots.map((s) => s.layout);
    const images = layouts.filter((l) => l === "full_image").length;
    const { retries, ...llm } = track(res);
    return {
      value: plan,
      summary: `${images} image scenes, ${layouts.length - images} designed scenes, ${plan.global.musicMood} music`,
      reason: `Style: ${plan.global.stylePrompt}`,
      output: { plan, repairs, ...llm },
      retries,
    };
  });

  const scenes = await stage("assets", async () => {
    const voice = community.defaultVoice;
    const speakAll = (list: Script["scenes"], speedUpPct: number) => mapLimit(list, config.maxParallelAssets, (scene) => engine.tts.speak(scene.narration, { voice, speedUpPct }));
    const total = (tracks: TtsResult[]) => tracks.reduce((n, t) => n + t.durationSec + config.scenePaddingSec, 0);

    // Voice first: the real audio length decides which scenes survive, so no image quota is spent on dropped scenes.
    let kept = script.scenes;
    let voices = await speakAll(kept, 0);
    const measuredSec = total(voices);
    const decision = governTimeline(kept.map((s, i) => ({ id: s.id, purpose: s.purpose, durationSec: voices[i].durationSec + config.scenePaddingSec })));
    const actions: GovernorAction[] = [...decision.actions];
    if (decision.dropIds.length || decision.speedUpPct) {
      kept = kept.filter((s) => !decision.dropIds.includes(s.id));
      voices = await speakAll(kept, decision.speedUpPct);
    }
    const finalSec = total(voices);
    const trimmedSilenceSec = voices.reduce((n, t) => n + (t.rawDurationSec - t.durationSec), 0);
    if (finalSec > budgetSec() + 0.5) {
      metrics.over_limit = true;
      actions.push({ type: "over_limit", detail: `Still ${finalSec.toFixed(1)}s after fixes for a ${budgetSec().toFixed(1)}s budget` });
    }
    metrics.governor_actions += actions.length;

    const value = await mapLimit(kept, config.maxParallelAssets, async (scene, i): Promise<RenderScene> => {
      const shot = plan.shots.find((s) => s.sceneId === scene.id)!;
      const track = voices[i];
      const wantsImage = shot.layout === "full_image";
      const image = wantsImage
        ? await engine.image.generate(`${shot.visualPrompt}. ${plan.global.stylePrompt}. Vertical composition, no text, no watermark.`).catch((err) => {
            console.warn(`  [image] ${scene.id} failed, using a designed scene: ${(err as Error).message.slice(0, 160)}`);
            return null;
          })
        : null;

      let imageFile: string | null = null;
      if (image) {
        imageFile = `${scene.id}.jpg`;
        fs.copyFileSync(image.file, path.join(publicDir, imageFile));
        if (image.cached) {
          metrics.images_cached++;
        } else {
          const size = imageSize(image.file);
          metrics.images++;
          metrics.neurons_est += fluxNeurons(size.width, size.height, image.steps);
        }
      } else if (wantsImage) {
        metrics.fallbacks++;
      }
      const audioFile = `${scene.id}.mp3`;
      fs.copyFileSync(track.audioFile, path.join(publicDir, audioFile));
      console.log(`  ${scene.id} ${wantsImage ? (image ? `image ${image.cached ? "cached" : `${(image.ms / 1000).toFixed(1)}s`}` : "image FAILED -> text card") : shot.layout}, voice ${track.durationSec.toFixed(1)}s (${track.timingSource})`);

      return {
        id: scene.id,
        narration: scene.narration,
        onScreenText: scene.onScreenText,
        // A scene whose image failed becomes a designed scene, so the video still finishes.
        layout: wantsImage && !image ? "text_card" : shot.layout,
        camera: shot.camera,
        transition: shot.transition,
        captionStyle: shot.captionStyle,
        emphasisWords: shot.emphasisWords,
        statValue: shot.statValue,
        imageFile,
        audioFile,
        durationSec: track.durationSec + config.scenePaddingSec,
        words: track.words,
      };
    });

    const fixes = actions.length ? ` Governor: ${actions.map((a) => a.type).join(", ")}.` : "";
    return {
      value,
      summary: `${value.length} voice tracks (${finalSec.toFixed(1)}s), ${metrics.images} new images, ${metrics.images_cached} cached, ${metrics.fallbacks} fallbacks.${fixes}`,
      reason: actions.length ? actions.map((a) => a.detail).join(" ") : `Voice is ${finalSec.toFixed(1)}s, inside the ${budgetSec().toFixed(1)}s budget`,
      output: {
        providers: { image: engine.image.name, tts: engine.tts.name, timings: [...new Set(voices.map((v) => v.timingSource))] },
        governor: { limitSec: config.video.maxSec(), budgetSec: budgetSec(), measuredSec, finalSec, speedUpPct: decision.speedUpPct, actions },
        trimmedSilenceSec: Number(trimmedSilenceSec.toFixed(2)),
        neurons_est: metrics.neurons_est,
        scenes: value.map((s) => ({ id: s.id, layout: s.layout, durationSec: s.durationSec })),
      },
    };
  });

  const durationSec = scenes.reduce((n, s) => n + s.durationSec, 0);
  const videoFile = path.join(workDir, "video.mp4");
  const thumbFile = path.join(workDir, "thumb.jpg");

  // QA gate, part 1: measure the layout before rendering and fix what can be fixed, so one render is enough.
  const pre = qaScenes({ scenes, publicDir });

  await stage("render", async () => {
    const inputProps: PulseVideoProps = { title: script.title, communityName: community.name, cta: script.cta, global: plan.global, scenes: pre.scenes };
    fs.writeFileSync(path.join(workDir, "props.json"), JSON.stringify(inputProps, null, 2));
    const serveUrl = await bundle({ entryPoint: path.resolve("remotion/index.ts"), publicDir });
    const composition = await selectComposition({ serveUrl, id: "PulseVideo", inputProps });
    await renderMedia({ composition, serveUrl, codec: "h264", crf: config.render.crf(), outputLocation: videoFile, inputProps, concurrency: os.cpus().length });
    execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", "0.5", "-i", videoFile, "-frames:v", "1", "-vf", "scale=540:-2", "-q:v", "4", thumbFile]);
    const sizeMb = fs.statSync(videoFile).size / 1024 / 1024;
    return { value: null, summary: `${durationSec.toFixed(1)}s video, ${sizeMb.toFixed(1)} MB`, output: { sizeMb, durationSec, cpus: os.cpus().length } };
  });

  // QA gate, part 2: measure the finished file. Loudness and file size are repaired by re-encoding.
  const qa = await stage("qa", async () => {
    const post = qaVideo(videoFile);
    const checks = [...pre.checks, ...post.checks];
    const s = summarizeChecks(checks);
    metrics.qa_fixed = s.fixed;
    metrics.qa_flagged = s.flagged;
    const named = (status: string) => checks.filter((c) => c.status === status).map((c) => c.label.toLowerCase()).join(", ");
    return {
      value: checks,
      status: s.fixed ? ("fixed" as const) : ("done" as const),
      summary: `${checks.length} checks: ${s.passed} passed, ${s.fixed} fixed, ${s.flagged} flagged.${s.fixed ? ` Fixed: ${named("fixed")}.` : ""}${s.flagged ? ` Flagged: ${named("flagged")}.` : ""}`,
      reason: checks.filter((c) => c.status !== "pass").map((c) => `${c.label}: ${c.detail}${c.before ? ` (${c.before} -> ${c.after})` : ""}`).join(" ") || "Every check passed without changes",
      output: { checks, reencoded: post.reencoded, sizeMb: fs.statSync(videoFile).size / 1024 / 1024 },
    };
  });

  metrics.fixes = metrics.script_revisions + metrics.governor_actions + metrics.qa_fixed;
  return { title: script.title, script, videoFile, thumbFile, durationSec, scores, qa, metrics };
}
