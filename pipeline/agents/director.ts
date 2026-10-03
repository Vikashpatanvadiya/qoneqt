import type { LlmProvider, LlmResult } from "../providers/llm";
import { MAX_IMAGE_SCENES, ShotPlanSchema, type CommunityProfile, type Script, type Shot, type ShotPlan } from "../schemas";
import { communityBlock } from "./community";

export type DirectorInput = { script: Script; communityProfile: CommunityProfile };

const SYSTEM = `You are a short-form video director for Qoneqt. Turn the script into a shot plan. Your plan directly controls the render.
Give exactly one shot per scene, with the same sceneId, in the same order.
Layouts:
- full_image: an AI image fills the frame. Write visualPrompt: one strong visual that matches the narration. No text, letters, logos or UI inside the image. Describe subject, setting, light and framing for a vertical 9:16 frame.
- text_card: a designed card with big animated text. Good for hooks, twists and questions.
- stat_card: a big number. Only use it if the narration has a real number, and put it in statValue (for example "73%").
- quote_card: a quote with an accent bar. Good for a line someone would say.
Rules:
- Use at most ${MAX_IMAGE_SCENES} full_image scenes. Use designed layouts for the rest. Never invent a statistic.
- The hook scene is a text_card or a very strong full_image. The last scene (the question) is a text_card.
- Vary camera moves between scenes so the video never feels static. Vary transitions too.
- One visual style for the whole video: global.stylePrompt is added to every image prompt.
- global.theme sets the look of the whole video. Pick the one that fits the content and emotion:
  midnight: dark, cinematic glow. Serious, dramatic or late-night topics.
  paper: warm off-white paper, framed photos, highlighter marks. Relatable stories, study, money, everyday life.
  neon: black with neon glow and duotone images. Gaming, tech, debates, hot takes.
  editorial: magazine look with serif type. Thoughtful, inspiring, career and craft topics.
  pop: bright orange gradient, bold condensed type, sticker titles. Humor, trends, fast and playful topics.
- global.palette is 3 to 4 hex colors (like "#7C3AED") that suit the style and stay readable on dark backgrounds. The first is the accent color.
- emphasisWords are 1 to 3 words copied exactly from that scene's narration.
- useHeroClip is always false.
Return only JSON.`;

const defaultShot = (sceneId: string): Shot => ({
  sceneId,
  layout: "text_card",
  camera: "zoom_in",
  transition: "fade",
  captionStyle: "pop",
  emphasisWords: [],
  useHeroClip: false,
});

// The render must never break on a bad plan, so the plan is repaired in code after validation.
export function normalizeShotPlan(plan: ShotPlan, script: Script): { plan: ShotPlan; repairs: string[] } {
  const repairs: string[] = [];
  let images = 0;
  const shots = script.scenes.map((scene) => {
    const found = plan.shots.find((s) => s.sceneId === scene.id);
    if (!found) repairs.push(`${scene.id}: no shot, used a text card`);
    const shot: Shot = { ...(found ?? defaultShot(scene.id)), useHeroClip: false };

    if (shot.layout === "full_image" && !shot.visualPrompt?.trim()) {
      repairs.push(`${scene.id}: full_image without a prompt, switched to text card`);
      shot.layout = "text_card";
    }
    if (shot.layout === "stat_card" && !shot.statValue?.trim()) {
      repairs.push(`${scene.id}: stat_card without a value, switched to text card`);
      shot.layout = "text_card";
    }
    if (shot.layout === "full_image" && ++images > MAX_IMAGE_SCENES) {
      repairs.push(`${scene.id}: over the ${MAX_IMAGE_SCENES} image limit, switched to text card`);
      shot.layout = "text_card";
    }
    return shot;
  });
  return { plan: { global: plan.global, shots }, repairs };
}

export function runDirector(llm: LlmProvider, input: DirectorInput): Promise<LlmResult<ShotPlan>> {
  const prompt = `${communityBlock(input.communityProfile)}
${input.communityProfile.defaultStyle ? `Preferred visual style: ${input.communityProfile.defaultStyle}\n` : ""}
SCRIPT: ${input.script.title}
${input.script.scenes.map((s) => `${s.id} [${s.purpose}]\n  narration: ${s.narration}\n  onScreenText: ${s.onScreenText}`).join("\n")}`;
  return llm.generateJson({ label: "director", system: SYSTEM, prompt, schema: ShotPlanSchema, tier: "light" });
}
