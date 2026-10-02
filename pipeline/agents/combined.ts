// One-call planner: input -> script + shot plan. This is the task Pulse-LM is fine-tuned for,
// so the prompt format here is used both to build the training data and to run the model.
import { z } from "zod";
import { MAX_IMAGE_SCENES, SCENE_MAX_WORDS, SCRIPT_MAX_WORDS, SCRIPT_MIN_WORDS, ScriptSchema, ShotPlanSchema, type CommunityProfile, type InputType } from "../schemas";
import { communityBlock } from "./community";

export const CombinedSchema = z.object({ script: ScriptSchema, plan: ShotPlanSchema });
export type Combined = z.infer<typeof CombinedSchema>;

export type CombinedInput = { inputType: InputType; content: string; communityProfile: CommunityProfile };

export const COMBINED_SYSTEM = `You are the Pulse Engine planner for Qoneqt, a community-first social platform. Turn the input into a 30 to 45 second vertical video: a script and a shot plan. Return only JSON with the keys "script" and "plan".
Script rules:
- Pick the angle most likely to make this community stop scrolling and comment.
- Scene 1 is the hook (purpose "hook"). No greetings. The hook is max 12 words.
- 5 to 8 scenes, one idea per scene, simple spoken language in the community's tone.
- ${SCRIPT_MIN_WORDS} to ${SCRIPT_MAX_WORDS} narration words in total, max ${SCENE_MAX_WORDS} words per scene. onScreenText is max 6 words.
- A twist near the middle (purpose "twist"). The last scene (purpose "cta") asks the community a question. cta repeats it. caption has 3 to 5 hashtags.
- Scene ids are "s1", "s2", ... in order.
Shot plan rules:
- One shot per scene, same sceneId, same order.
- layout is full_image (write visualPrompt, no text in the image), text_card, stat_card (only with a real number, in statValue) or quote_card.
- At most ${MAX_IMAGE_SCENES} full_image scenes. The last scene is a text_card.
- Vary camera and transition. emphasisWords are 1 to 3 words copied from that scene's narration. useHeroClip is false.
- global.stylePrompt is one visual style for every image. global.palette is 3 to 4 hex colors. global.musicMood is upbeat, calm, dramatic or inspiring.`;

export function combinedPrompt(input: CombinedInput): string {
  return `${communityBlock(input.communityProfile)}

INPUT TYPE: ${input.inputType}
INPUT:
${input.content}`;
}
