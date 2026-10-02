import { geminiLlm, type LlmResult } from "../providers/llm";
import { SCENE_MAX_WORDS, SCRIPT_MAX_WORDS, SCRIPT_MIN_WORDS, ScriptSchema, StrictScriptSchema, type CommunityProfile, type Research, type Script } from "../schemas";
import { communityBlock } from "./community";

export type ScriptwriterInput = { content: string; research: Research; communityProfile: CommunityProfile };

const SYSTEM = `You are the scriptwriter for Qoneqt, a community-first social platform. You write 30 to 45 second vertical videos.
Rules:
- Scene 1 is the hook (purpose "hook"). No greetings, no "in this video". The hook is max 12 words and must make someone stop scrolling.
- 5 to 8 scenes. One idea per scene. Short sentences. Simple spoken language in the community's language and tone.
- LENGTH IS STRICT: ${SCRIPT_MIN_WORDS} to ${SCRIPT_MAX_WORDS} narration words in total, and max ${SCENE_MAX_WORDS} words in any scene. Count before you answer.
- onScreenText is max 6 words and is not a copy of the narration. It is the punchy version.
- Put a twist or pattern break near the middle (purpose "twist").
- The last scene (purpose "cta") asks the community a question they want to answer. Never "like and subscribe".
- cta repeats that question. caption is a post caption with 3 to 5 hashtags.
- Scene ids are "s1", "s2", ... in order. Scene 1 narration starts with the hook.
Return only JSON.`;

export async function runScriptwriter(input: ScriptwriterInput): Promise<LlmResult<Script>> {
  const angle = input.research.angles[input.research.chosenIndex];
  const prompt = `${communityBlock(input.communityProfile)}

CHOSEN ANGLE
Title: ${angle.title}
Hook idea: ${angle.hookIdea}
Why it works: ${angle.whyItWorks}
Target emotion: ${angle.targetEmotion}

WHAT THE INPUT IS ABOUT
${input.research.summary}

ORIGINAL INPUT
${input.content}`;

  try {
    return await geminiLlm.generateJson({ label: "scriptwriter", system: SYSTEM, prompt, schema: StrictScriptSchema });
  } catch (err) {
    // A slightly long script is better than no video: accept any well-formed script.
    console.warn(`  [scriptwriter] strict length rules failed, accepting a well-formed script: ${(err as Error).message.slice(0, 160)}`);
    return geminiLlm.generateJson({ label: "scriptwriter (lenient)", system: SYSTEM, prompt, schema: ScriptSchema });
  }
}
