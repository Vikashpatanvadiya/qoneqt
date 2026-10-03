// Clip Finder: reads a long video's timestamped transcript and proposes the moments that work as stand-alone shorts.
// It only proposes. Code snaps every clip to sentence boundaries, enforces the length and removes overlaps.
import { z } from "zod";
import type { LlmProvider, LlmResult } from "../providers/llm";

export const ClipIdeaSchema = z.object({
  title: z.string().describe("Short title for the clip, max 8 words"),
  hook: z.string().describe("On-screen hook for the first seconds, max 9 words, grabs attention without spoiling the payoff"),
  startSec: z.number().describe("Start time in seconds, at the start of a sentence"),
  endSec: z.number().describe("End time in seconds, at the end of a sentence, after the payoff"),
  reason: z.string().describe("One sentence: why this moment works as a short on its own"),
  score: z.number().min(1).max(10).describe("How likely it is to stop the scroll and get comments, 1 to 10"),
  emphasisWords: z.array(z.string()).describe("2 to 5 key words spoken in the clip, copied exactly, to highlight in the captions"),
});
export type ClipIdea = z.infer<typeof ClipIdeaSchema>;
export const ClipIdeasSchema = z.object({ clips: z.array(ClipIdeaSchema) });

const SYSTEM = `You are a senior short-form video editor. You get the timestamped transcript of a long video (a talk, podcast, lecture, vlog or stream) and pick the moments that work as stand-alone vertical shorts.
A great clip:
- Starts strong: a claim, a question, a surprising fact or the start of a story. Never starts mid-thought or with "so", "and", "um".
- Makes sense without the rest of the video.
- Has a payoff: an answer, a twist, a punchline, a clear takeaway. It ends right after the payoff.
- Is one idea, not two.
Prefer: surprising facts, strong opinions, emotional or funny moments, practical tips, quotable lines, stories with a turn.
Avoid: intros, sponsor reads, "subscribe" requests, housekeeping, moments that need visuals the viewer cannot see.
Times are in seconds. Use the line start times for startSec and line end times for endSec. Clips must not overlap.
Write the title and hook in the language of the video. Return only JSON.`;

export function runClipFinder(llm: LlmProvider, input: { title: string; lines: string; count: number; minSec: number; maxSec: number; durationSec: number }): Promise<LlmResult<{ clips: ClipIdea[] }>> {
  const prompt = `VIDEO: ${input.title} (${Math.round(input.durationSec)} seconds long)
Find the ${input.count + 3} best clips, each ${input.minSec} to ${input.maxSec} seconds long, sorted best first.

TRANSCRIPT (one line per sentence: [start - end] text):
${input.lines}`;
  return llm.generateJson({ label: "clip finder", system: SYSTEM, prompt, schema: ClipIdeasSchema });
}
