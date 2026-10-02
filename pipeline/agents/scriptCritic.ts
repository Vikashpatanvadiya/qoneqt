import type { LlmProvider, LlmResult } from "../providers/llm";
import { CritiqueSchema, type CommunityProfile, type Critique, type Script } from "../schemas";
import { communityBlock } from "./community";

export type CriticInput = { script: Script; communityProfile: CommunityProfile };
export type CriticThresholds = { minOverall: number; minHook: number };

const SYSTEM = `You are a tough short-form video editor for Qoneqt, a community-first social platform. You review a script BEFORE any money or quota is spent on images and voice.
Score each area from 1 to 10. Be strict and honest: 5 is average, 7 is good, 8 is strong, 9 or 10 is rare.
- hook: would the first line stop a fast scroller within 2 seconds? A generic question, a definition, or "did you know" is 5 or less. A specific, surprising, personal or contrarian line is 8 or more.
- clarity: one idea per scene, simple spoken words, no jargon, nothing a listener has to re-read.
- pacing: no filler scene, a twist or pattern break near the middle, every scene moves forward.
- communityFit: tone, language and topic match the community profile. It sounds like this community, not like an ad.
- retention: there is a reason to keep watching until the end, and the last question is one people want to answer.
overall is the average of the five scores.
For every score below 8, add at least one issue with the sceneId, the problem, and a concrete fix written as the new line itself.
verdict is "pass" only if the script is ready to publish, otherwise "revise".
Do not praise. Return only JSON.`;

export function runScriptCritic(llm: LlmProvider, input: CriticInput): Promise<LlmResult<Critique>> {
  const prompt = `${communityBlock(input.communityProfile)}

SCRIPT: ${input.script.title}
Hook: ${input.script.hook}
${input.script.scenes.map((s) => `${s.id} [${s.purpose}]\n  narration: ${s.narration}\n  onScreenText: ${s.onScreenText}`).join("\n")}
Closing question: ${input.script.cta}`;
  // A different, lighter model than the Scriptwriter: it has a higher free rate limit and does not grade its own work.
  return llm.generateJson({ label: "script critic", system: SYSTEM, prompt, schema: CritiqueSchema, tier: "light" });
}

// The critic advises, code decides: the overall score is recomputed and the thresholds are applied here.
export function judge(critique: Critique, thresholds: CriticThresholds): { overall: number; passed: boolean } {
  const s = critique.scores;
  const overall = Number(((s.hook + s.clarity + s.pacing + s.communityFit + s.retention) / 5).toFixed(1));
  return { overall, passed: overall >= thresholds.minOverall && s.hook >= thresholds.minHook };
}
