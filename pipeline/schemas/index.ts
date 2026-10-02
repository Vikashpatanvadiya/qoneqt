// Zod schemas for every agent output (CLAUDE.md Section 7). /shared/types.ts re-exports the inferred types.
import { z } from "zod";

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

// 7.0 Community Brain
export const CommunityProfileSchema = z.object({
  name: z.string(),
  description: z.string().default(""),
  audience: z.string().default(""),
  tone: z.string().default(""),
  language: z.enum(["en-IN", "hi-IN", "hinglish", "gu-IN"]).default("en-IN"),
  vocabulary: z.array(z.string()).default([]),
  topicsToCover: z.array(z.string()).default([]),
  topicsToAvoid: z.array(z.string()).default([]),
  exampleHooks: z.array(z.string()).default([]),
  defaultStyle: z.string().default(""),
  defaultVoice: z.string().default(""),
});
export type CommunityProfile = z.infer<typeof CommunityProfileSchema>;

export const InputTypeSchema = z.enum(["topic", "trend", "thread", "idea"]);
export type InputType = z.infer<typeof InputTypeSchema>;

// 7.1 Researcher
export const ResearchSchema = z.object({
  summary: z.string().describe("What this input is really about, 2 lines"),
  angles: z
    .array(
      z.object({
        title: z.string(),
        hookIdea: z.string(),
        whyItWorks: z.string(),
        targetEmotion: z.enum(["curiosity", "surprise", "inspiration", "humor", "debate", "relatability"]),
      }),
    )
    .length(3),
  chosenIndex: z.number().int().min(0).max(2),
  reason: z.string().describe("Why the chosen angle will make people stop scrolling and comment"),
});
export type Research = z.infer<typeof ResearchSchema>;

// 7.2 Scriptwriter
export const ScriptSchema = z.object({
  title: z.string(),
  hook: z.string().describe("Max 12 words, spoken in the first 2 seconds"),
  scenes: z
    .array(
      z.object({
        id: z.string().describe('"s1", "s2", ... in order'),
        purpose: z.enum(["hook", "context", "point", "twist", "cta"]),
        narration: z.string().describe("Spoken line for this scene"),
        onScreenText: z.string().describe("Max 6 words"),
      }),
    )
    .min(5)
    .max(8),
  cta: z.string().describe("A question that makes people comment"),
  caption: z.string().describe("Suggested post caption with 3 to 5 hashtags"),
  estDurationSec: z.number(),
});
export type Script = z.infer<typeof ScriptSchema>;

// The measured voice speed is about 2.1 words per second, so 45 sec is roughly 95 words.
export const SCRIPT_MIN_WORDS = 60;
export const SCRIPT_MAX_WORDS = 92;
export const SCENE_MAX_WORDS = 20;

export const scriptWordCount = (script: Script) => script.scenes.reduce((n, s) => n + words(s.narration), 0);

// Same shape, plus the length rules. A failure here goes back to the model as a validation error.
export const StrictScriptSchema = ScriptSchema.superRefine((script, ctx) => {
  const total = scriptWordCount(script);
  if (total > SCRIPT_MAX_WORDS || total < SCRIPT_MIN_WORDS) {
    ctx.addIssue({ code: "custom", message: `Total narration is ${total} words. It must be ${SCRIPT_MIN_WORDS} to ${SCRIPT_MAX_WORDS} words across all scenes.` });
  }
  script.scenes.forEach((scene, i) => {
    if (words(scene.narration) > SCENE_MAX_WORDS) {
      ctx.addIssue({ code: "custom", path: ["scenes", i, "narration"], message: `${scene.id} narration is ${words(scene.narration)} words. Max ${SCENE_MAX_WORDS}.` });
    }
    if (words(scene.onScreenText) > 6) {
      ctx.addIssue({ code: "custom", path: ["scenes", i, "onScreenText"], message: `${scene.id} onScreenText is over 6 words.` });
    }
  });
  if (script.scenes[0]?.purpose !== "hook") ctx.addIssue({ code: "custom", message: "Scene 1 must have purpose hook." });
});

// 7.3 Script Critic
const score = z.number().min(1).max(10);
export const CritiqueSchema = z.object({
  scores: z.object({ hook: score, clarity: score, pacing: score, communityFit: score, retention: score }),
  overall: score,
  verdict: z.enum(["pass", "revise"]),
  issues: z.array(z.object({ sceneId: z.string(), problem: z.string(), fix: z.string().describe("A concrete rewrite, not general advice") })),
});
export type Critique = z.infer<typeof CritiqueSchema>;

export type ScriptVersion = { version: number; script: Script; wordCount: number; critique: Critique | null; overall: number | null; passed: boolean };

// 7.4 Director
export const LayoutSchema = z.enum(["full_image", "text_card", "stat_card", "quote_card"]);
export const CameraSchema = z.enum(["zoom_in", "zoom_out", "pan_left", "pan_right", "static"]);
export const TransitionSchema = z.enum(["cut", "fade", "slide", "zoom"]);
export const CaptionStyleSchema = z.enum(["pop", "karaoke", "minimal"]);
export const MusicMoodSchema = z.enum(["upbeat", "calm", "dramatic", "inspiring"]);

export const ShotSchema = z.object({
  sceneId: z.string(),
  layout: LayoutSchema,
  visualPrompt: z.string().optional().describe("Only for full_image. One strong image, no text in it"),
  negativePrompt: z.string().optional(),
  camera: CameraSchema,
  transition: TransitionSchema,
  captionStyle: CaptionStyleSchema,
  emphasisWords: z.array(z.string()).describe("Words from the narration to highlight"),
  statValue: z.string().optional().describe('Only for stat_card, e.g. "73%"'),
  useHeroClip: z.boolean(),
});
export type Shot = z.infer<typeof ShotSchema>;

export const ShotPlanSchema = z.object({
  global: z.object({
    stylePrompt: z.string().describe("Added to every image prompt for visual consistency"),
    palette: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(3).max(4),
    musicMood: MusicMoodSchema,
  }),
  shots: z.array(ShotSchema).min(1),
});
export type ShotPlan = z.infer<typeof ShotPlanSchema>;

export const MAX_IMAGE_SCENES = 5;
