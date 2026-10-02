// Duration governor. Prompts ask for the right length, this code enforces it.
// It runs twice: on the script (word counts, estimate) and on the real voice tracks (measured seconds).
import { config } from "./config";
import type { Script } from "./schemas";

export type GovernorAction = {
  type: "trim_scene" | "drop_scene" | "speed_up" | "over_limit";
  sceneId?: string;
  detail: string;
};

type Purpose = Script["scenes"][number]["purpose"];

const wordsOf = (text: string) => text.trim().split(/\s+/).filter(Boolean);

// Seconds the narration needs. Usable in the video = limit minus the outro.
export const budgetSec = () => config.video.maxSec() - config.video.outroSec;
const estimateSceneSec = (narration: string) => wordsOf(narration).length / config.video.wordsPerSec + config.scenePaddingSec;

// Cut a line that is too long at the last sentence end inside the cap, or at the cap.
function trimNarration(narration: string, maxWords: number): string {
  const words = wordsOf(narration);
  if (words.length <= maxWords) return narration;
  const capped = words.slice(0, maxWords);
  const lastStop = capped.map((w) => /[.!?]$/.test(w)).lastIndexOf(true);
  if (lastStop >= Math.floor(maxWords / 2)) return capped.slice(0, lastStop + 1).join(" ");
  return `${capped.join(" ").replace(/[,;:\-–—]+$/, "")}.`;
}

// The hook, the twist and the closing question carry the video. Points and context can go, latest first.
function pickDroppable<T extends { id: string; purpose: Purpose }>(scenes: T[]): T | undefined {
  const middle = scenes.slice(1, -1);
  return [...middle].reverse().find((s) => s.purpose === "point") ?? [...middle].reverse().find((s) => s.purpose === "context");
}

export type ScriptGovernorResult = { script: Script; estimatedSec: number; budgetSec: number; actions: GovernorAction[] };

export function governScript(script: Script): ScriptGovernorResult {
  const actions: GovernorAction[] = [];
  const budget = budgetSec();
  const { hardMaxWordsPerScene, minScenes } = config.video;

  let scenes = script.scenes.map((scene) => {
    const before = wordsOf(scene.narration).length;
    if (before <= hardMaxWordsPerScene) return scene;
    const narration = trimNarration(scene.narration, hardMaxWordsPerScene);
    actions.push({ type: "trim_scene", sceneId: scene.id, detail: `${before} words cut to ${wordsOf(narration).length} (cap ${hardMaxWordsPerScene})` });
    return { ...scene, narration };
  });

  const estimate = () => scenes.reduce((n, s) => n + estimateSceneSec(s.narration), 0);
  while (estimate() > budget && scenes.length > minScenes) {
    const drop = pickDroppable(scenes);
    if (!drop) break;
    actions.push({ type: "drop_scene", sceneId: drop.id, detail: `Estimated ${estimate().toFixed(1)}s is over the ${budget.toFixed(1)}s budget, dropped the ${drop.purpose} scene` });
    scenes = scenes.filter((s) => s.id !== drop.id);
  }

  return { script: { ...script, scenes, estDurationSec: Number(estimate().toFixed(1)) }, estimatedSec: estimate(), budgetSec: budget, actions };
}

export type TimelineDecision = { dropIds: string[]; speedUpPct: number; actions: GovernorAction[] };

// Decide from measured voice lengths. Small overruns are fixed by a faster voice, larger ones by dropping a scene first.
export function governTimeline(scenes: Array<{ id: string; purpose: Purpose; durationSec: number }>): TimelineDecision {
  const actions: GovernorAction[] = [];
  const budget = budgetSec();
  const { minScenes, maxSpeedUpPct } = config.video;
  let kept = scenes;
  const total = () => kept.reduce((n, s) => n + s.durationSec, 0);

  while (total() / budget > 1.1 && kept.length > minScenes) {
    const drop = pickDroppable(kept);
    if (!drop) break;
    actions.push({ type: "drop_scene", sceneId: drop.id, detail: `Voice tracks total ${total().toFixed(1)}s, over the ${budget.toFixed(1)}s budget, dropped the ${drop.purpose} scene` });
    kept = kept.filter((s) => s.id !== drop.id);
  }

  let speedUpPct = 0;
  const ratio = total() / budget;
  if (ratio > 1) {
    speedUpPct = Math.min(maxSpeedUpPct, Math.ceil((ratio - 1) * 100) + 3);
    actions.push({ type: "speed_up", detail: `Voice tracks total ${total().toFixed(1)}s for a ${budget.toFixed(1)}s budget, voice sped up by ${speedUpPct}%` });
  }

  return { dropIds: scenes.filter((s) => !kept.includes(s)).map((s) => s.id), speedUpPct, actions };
}
