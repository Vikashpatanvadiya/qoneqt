// Vision Critic stage (CLAUDE.md 7.5): render one real frame per scene, let a vision model judge it,
// regenerate bad images, fix unreadable text, and fall back to a designed card when an image cannot work.
// Every round's stills are kept, so the UI can show before and after.
import fs from "node:fs";
import path from "node:path";
import type { PulseVideoProps, RenderScene } from "../shared/types";
import { decide, runVisionCritic, type VisionDecision } from "./agents/visionCritic";
import { fluxNeurons } from "./cost/pricing";
import { imageSize, type GenerateResult, type StageResult } from "./generate";
import type { Engine } from "./providers";
import { LlmError, type LlmAttempt } from "./providers/llm";
import type { CommunityProfile, ShotPlan, VisionReview } from "./schemas";
import { renderSceneStills } from "./stills";

const MAX_REGENERATIONS = 2;

// Deliberately unrelated, text-heavy prompt for the debug option. Image models tend to garble text, which the critic should catch.
const BROKEN_PROMPT = "a close-up of a hand holding a crumpled paper sign covered in handwritten words, cluttered street market background";

type Round = { round: number; stillUrl: string; review: VisionReview | null; decision: VisionDecision | "skipped" };
type SceneReport = {
  sceneId: string;
  layout: string;
  rounds: Round[];
  fix: "regenerated" | "template" | "high_contrast" | null;
  beforeUrl: string | null;
  afterUrl: string | null;
  finalScore: number | null;
};

export type VisionStageInput = {
  scenes: RenderScene[];
  plan: ShotPlan;
  engine: Engine;
  community: CommunityProfile;
  workDir: string;
  publicDir: string;
  propsFor: (scenes: RenderScene[]) => PulseVideoProps;
  bundleNow: () => Promise<string>;
  serveUrl: string;
  metrics: GenerateResult["metrics"];
  scores: GenerateResult["scores"];
  track: (attempts: LlmAttempt[]) => { attempts: LlmAttempt[]; retries: number };
  uploadStill?: (file: string, name: string) => Promise<string>;
  breakScene?: string;
};

export async function runVisionStage(input: VisionStageInput): Promise<StageResult<{ scenes: RenderScene[]; rebundle: boolean }>> {
  const { plan, engine, community, publicDir, metrics, scores } = input;
  const stillsDir = path.join(input.workDir, "stills");
  fs.mkdirSync(stillsDir, { recursive: true });
  const scenes = input.scenes.map((s) => ({ ...s }));
  const promptOf = new Map(plan.shots.map((s) => [s.sceneId, s.visualPrompt]));
  const reports = new Map<string, SceneReport>(scenes.map((s) => [s.id, { sceneId: s.id, layout: s.layout, rounds: [], fix: null, beforeUrl: null, afterUrl: null, finalScore: null }]));
  const regenerations = new Map<string, number>();
  const attempts: LlmAttempt[] = [];
  const publish = async (file: string, name: string) => (input.uploadStill ? input.uploadStill(file, name).catch(() => file) : file);
  let serveUrl = input.serveUrl;
  let imagesChanged = false;
  let skippedReason: string | null = null;

  const useImage = async (scene: RenderScene, prompt: string, label: string) => {
    const image = await engine.image.generate(`${prompt}. ${plan.global.stylePrompt}. Vertical composition, no text, no watermark.`);
    const file = `${scene.id}_${label}.jpg`;
    fs.copyFileSync(image.file, path.join(publicDir, file));
    if (!image.cached) {
      const size = imageSize(image.file);
      metrics.images++;
      metrics.neurons_est += fluxNeurons(size.width, size.height, image.steps);
    }
    scene.imageFile = file;
    promptOf.set(scene.id, prompt);
    imagesChanged = true;
  };

  // Debug option: break one image scene on purpose, to show the critic catching it.
  // "auto" picks the first image scene.
  const isImageScene = (s: RenderScene) => s.layout === "full_image" && Boolean(s.imageFile);
  const broken = input.breakScene ? scenes.find((s) => isImageScene(s) && (input.breakScene === "auto" || s.id === input.breakScene)) : undefined;
  if (broken) await useImage(broken, BROKEN_PROMPT, "broken").catch(() => undefined);

  let toCheck = scenes.map((s) => s.id);
  for (let round = 1; toCheck.length > 0 && round <= MAX_REGENERATIONS + 1; round++) {
    if (imagesChanged) serveUrl = await input.bundleNow();
    const stills = await renderSceneStills({ serveUrl, props: input.propsFor(scenes), sceneIds: toCheck, outDir: stillsDir, suffix: `r${round}` });

    let reviews: Map<string, VisionReview>;
    try {
      const res = await runVisionCritic(engine.vision, {
        communityProfile: community,
        stills: toCheck.map((id) => {
          const scene = scenes.find((s) => s.id === id)!;
          return { sceneId: id, file: stills.get(id)!, narration: scene.narration, onScreenText: scene.onScreenText, layout: scene.layout, visualPrompt: scene.imageFile ? promptOf.get(id) : undefined };
        }),
      });
      attempts.push(...res.attempts);
      reviews = res.data;
    } catch (err) {
      // Rate limited or unavailable: never fail the video for this. The scenes are marked as not checked.
      if (err instanceof LlmError) attempts.push(...err.attempts);
      skippedReason = (err as Error).message.slice(0, 200);
      for (const id of toCheck) reports.get(id)!.rounds.push({ round, stillUrl: await publish(stills.get(id)!, `${id}_r${round}.jpg`), review: null, decision: "skipped" });
      break;
    }

    const next: string[] = [];
    for (const id of toCheck) {
      const scene = scenes.find((s) => s.id === id)!;
      const report = reports.get(id)!;
      const stillUrl = await publish(stills.get(id)!, `${id}_r${round}.jpg`);
      const review = reviews.get(id) ?? null;
      if (!review) {
        report.rounds.push({ round, stillUrl, review: null, decision: "skipped" });
        continue;
      }
      let decision = decide(review, scene.layout === "full_image" && Boolean(scene.imageFile));
      report.finalScore = review.score;
      report.beforeUrl ??= stillUrl;

      if (decision === "regenerate") {
        const done = regenerations.get(id) ?? 0;
        if (done >= MAX_REGENERATIONS) {
          decision = "template";
        } else {
          const prompt = review.newVisualPrompt?.trim() || `Simple, clean, uncluttered photo: ${promptOf.get(id) ?? scene.onScreenText}`;
          try {
            await useImage(scene, prompt, `v${done + 2}`);
            regenerations.set(id, done + 1);
            report.fix = "regenerated";
            next.push(id);
          } catch {
            decision = "template";
          }
        }
      }
      if (decision === "template") {
        // A designed card never fails and still carries the line.
        scene.layout = "text_card";
        scene.imageFile = null;
        report.fix = "template";
      }
      if (decision === "high_contrast" && !scene.highContrast) {
        scene.highContrast = true;
        report.fix ??= "high_contrast";
      }
      report.rounds.push({ round, stillUrl, review, decision });
    }
    toCheck = next;
  }

  // After stills for every fixed scene, rendered from the final state.
  const fixedIds = [...reports.values()].filter((r) => r.fix).map((r) => r.sceneId);
  if (fixedIds.length) {
    if (imagesChanged) serveUrl = await input.bundleNow();
    const after = await renderSceneStills({ serveUrl, props: input.propsFor(scenes), sceneIds: fixedIds, outDir: stillsDir, suffix: "final" });
    for (const id of fixedIds) reports.get(id)!.afterUrl = await publish(after.get(id)!, `${id}_final.jpg`);
  }

  const list = [...reports.values()];
  const reviewed = list.filter((r) => r.finalScore !== null);
  const skipped = list.filter((r) => r.rounds.length === 0 || r.rounds.every((x) => x.decision === "skipped"));
  scores.vision_avg = reviewed.length ? Number((reviewed.reduce((n, r) => n + r.finalScore!, 0) / reviewed.length).toFixed(1)) : null;
  metrics.vision_fixes = fixedIds.length;
  metrics.vision_skipped = skipped.length;
  const llm = input.track(attempts);

  const describe = (r: SceneReport) => {
    const first = r.rounds.find((x) => x.review)?.review;
    const last = [...r.rounds].reverse().find((x) => x.review)?.review;
    const what = r.fix === "regenerated" ? "new image" : r.fix === "template" ? "switched to a designed card" : "dark backing behind text";
    return `${r.sceneId} ${what}${first && last && first !== last ? ` (${first.score} -> ${last.score})` : first ? ` (was ${first.score})` : ""}`;
  };
  const rounds = Math.max(0, ...list.map((r) => r.rounds.length));
  const status: "done" | "fixed" | "skipped" = reviewed.length === 0 ? "skipped" : fixedIds.length ? "fixed" : "done";
  const firstProblem = list.find((r) => r.fix)?.rounds.find((x) => x.review)?.review?.notes;

  return {
    value: { scenes, rebundle: imagesChanged },
    status,
    summary:
      status === "skipped"
        ? "Vision check skipped: the vision model was not available. The video continues unchecked."
        : `Checked ${reviewed.length} frames in ${rounds} round${rounds > 1 ? "s" : ""}, average score ${scores.vision_avg}.${fixedIds.length ? ` Fixed: ${list.filter((r) => r.fix).map(describe).join("; ")}.` : " Nothing to fix."}${skipped.length ? ` ${skipped.length} not checked.` : ""}`,
    reason: skippedReason ?? firstProblem ?? "Every frame matched its line and was readable",
    output: { scenes: list, deliberatelyBroken: broken?.id ?? null, ...llm },
    retries: llm.retries,
  };
}
