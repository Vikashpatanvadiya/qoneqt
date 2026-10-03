import { z } from "zod";
import type { LlmResult, VisionProvider } from "../providers/llm";
import { VisionReviewSchema, type CommunityProfile, type VisionReview } from "../schemas";

export type StillForReview = {
  sceneId: string;
  file: string;
  narration: string;
  onScreenText: string;
  layout: string;
  visualPrompt?: string;
};

const SYSTEM = `You are the final visual check for short vertical videos on Qoneqt, a community-first social platform.
You get one frame from the middle of each scene, exactly as viewers will see it, with captions and on-screen text drawn on top.
For each frame, judge:
- matchesNarration: does the picture clearly fit what is being said? A loosely related stock-photo feel is fine. A wrong subject is not.
- captionReadable: can the captions and on-screen text be read easily on a phone?
- looksAiGenerated: the picture has an obvious AI look: plastic or waxy skin, uncanny faces, glowing oversaturated colors, extra fingers, garbled text. Real-looking photos with natural light pass.
- hasArtifacts: deformed hands or faces, extra fingers, melted objects, or any garbled, misspelled or fake text inside the generated picture (text added by the video itself is fine).
- score from 1 to 10 for how ready this frame is to publish.
- action:
  - "keep" when it is fine.
  - "regenerate_image" when an AI image is wrong for the narration or has artifacts. Write newVisualPrompt: a simpler, concrete scene that fits the narration, with no text, signs, screens with writing, or close-up hands.
  - "adjust_caption" when only the text is hard to read.
  - "use_template" when a picture cannot work for this line (for example an abstract idea), so a designed text card is better.
Scenes with the layout text_card, stat_card or quote_card are designed cards with no AI image: only "keep" or "adjust_caption" apply to them.
Return one review per frame, with the frame's sceneId. Be strict about artifacts and wrong subjects. Return only JSON.`;

const BatchSchema = z.object({ reviews: z.array(VisionReviewSchema) });

// All frames go in one call, so a video costs one vision request per round instead of one per scene.
export async function runVisionCritic(vision: VisionProvider, input: { stills: StillForReview[]; communityProfile: CommunityProfile }): Promise<LlmResult<Map<string, VisionReview>>> {
  const prompt = `Community: ${input.communityProfile.name}. Audience: ${input.communityProfile.audience}

The frames are attached in this order:
${input.stills
  .map((s, i) => `Frame ${i + 1} = sceneId ${s.sceneId}, layout ${s.layout}
  narration: ${s.narration}
  on-screen text: ${s.onScreenText}${s.visualPrompt ? `\n  image was generated from: ${s.visualPrompt}` : ""}`)
  .join("\n")}`;
  const res = await vision.inspectJson({
    label: "vision critic",
    system: SYSTEM,
    prompt,
    schema: BatchSchema,
    images: input.stills.map((s) => ({ file: s.file, mimeType: "image/jpeg" })),
    tier: "light",
  });
  return { ...res, data: new Map(res.data.reviews.map((r) => [r.sceneId, r])) };
}

export type VisionDecision = "keep" | "regenerate" | "high_contrast" | "template";

// The critic advises, code decides. Flags count even when the critic's own action says "keep".
export function decide(review: VisionReview, isImageScene: boolean): VisionDecision {
  if (isImageScene && (review.action === "use_template")) return "template";
  if (isImageScene && (review.action === "regenerate_image" || review.hasArtifacts || review.looksAiGenerated || !review.matchesNarration || review.score < 6)) return "regenerate";
  if (review.action === "adjust_caption" || !review.captionReadable) return "high_contrast";
  return "keep";
}
