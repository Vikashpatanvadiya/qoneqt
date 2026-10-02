import { geminiLlm } from "../providers/llm";
import { ResearchSchema, type CommunityProfile, type InputType } from "../schemas";
import { communityBlock } from "./community";

export type ResearcherInput = { inputType: InputType; content: string; communityProfile: CommunityProfile; audience?: string };

const SYSTEM = `You are the research lead for Qoneqt, a community-first social platform.
Read the input and use the community profile.
If the input is a community thread, find the most interesting tension, insight, or question people care about.
If the input is already a full script or brief, pull out its core idea and still propose angles.
Give exactly 3 different angles for a 30 to 45 second vertical video.
Pick the one most likely to make someone stop scrolling AND comment. Prefer angles that start a community conversation.
chosenIndex is 0, 1 or 2. Return only JSON.`;

export function runResearcher(input: ResearcherInput) {
  const prompt = `${communityBlock(input.communityProfile)}
${input.audience ? `\nAudience for this video: ${input.audience}` : ""}
INPUT TYPE: ${input.inputType}
INPUT:
${input.content}`;
  return geminiLlm.generateJson({ label: "researcher", system: SYSTEM, prompt, schema: ResearchSchema });
}
