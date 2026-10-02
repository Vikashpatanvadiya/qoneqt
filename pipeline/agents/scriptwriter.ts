import { LlmError, type LlmProvider, type LlmResult } from "../providers/llm";
import { SCENE_MAX_WORDS, SCRIPT_MAX_WORDS, SCRIPT_MIN_WORDS, ScriptSchema, StrictScriptSchema, type CommunityProfile, type Critique, type Research, type Script } from "../schemas";
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

export async function runScriptwriter(llm: LlmProvider, input: ScriptwriterInput): Promise<LlmResult<Script>> {
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
    return await llm.generateJson({ label: "scriptwriter", system: SYSTEM, prompt, schema: StrictScriptSchema });
  } catch (err) {
    // A slightly long script is better than no video: accept any well-formed script. The duration governor trims it in code.
    console.warn(`  [scriptwriter] strict length rules failed, accepting a well-formed script: ${(err as Error).message.slice(0, 160)}`);
    const earlier = err instanceof LlmError ? err.attempts : [];
    const res = await llm.generateJson({ label: "scriptwriter (lenient)", system: SYSTEM, prompt, schema: ScriptSchema });
    return { ...res, attempts: [...earlier, ...res.attempts] };
  }
}

export type RevisionInput = { script: Script; critique: Critique; communityProfile: CommunityProfile };

const REVISION_RULES = `
You are now REVISING a script after an editor's review.
- Fix every issue the editor listed. Use the editor's fix as a starting point, and make it better if you can.
- Keep scenes the editor did not complain about, unless a change elsewhere forces an edit.
- The lowest score is the priority. If the hook scored under 8, write a new hook that is specific, surprising or personal.
- Do not make the script longer. The length rules above still apply.`;

// Rewrites a script from the Script Critic's issues. Same output shape and length rules as the first draft.
export async function runScriptRevision(llm: LlmProvider, input: RevisionInput): Promise<LlmResult<Script>> {
  const { scores, issues } = input.critique;
  const prompt = `${communityBlock(input.communityProfile)}

CURRENT SCRIPT
${JSON.stringify(input.script, null, 2)}

EDITOR SCORES (1 to 10)
hook ${scores.hook}, clarity ${scores.clarity}, pacing ${scores.pacing}, communityFit ${scores.communityFit}, retention ${scores.retention}

EDITOR ISSUES
${issues.map((i) => `- ${i.sceneId}: ${i.problem}\n  Fix: ${i.fix}`).join("\n") || "- No specific issues listed. Raise the weakest score."}`;

  try {
    return await llm.generateJson({ label: "scriptwriter revision", system: SYSTEM + REVISION_RULES, prompt, schema: StrictScriptSchema });
  } catch (err) {
    const earlier = err instanceof LlmError ? err.attempts : [];
    const res = await llm.generateJson({ label: "scriptwriter revision (lenient)", system: SYSTEM + REVISION_RULES, prompt, schema: ScriptSchema });
    return { ...res, attempts: [...earlier, ...res.attempts] };
  }
}
