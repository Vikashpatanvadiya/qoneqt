// Community Brain: the saved profile that conditions the Researcher, Scriptwriter and Director.
import { CommunityProfileSchema, type CommunityProfile } from "../schemas";

// Used when a job has no community. Nayan: tune this once Section 15 is filled in.
export const DEFAULT_COMMUNITY: CommunityProfile = CommunityProfileSchema.parse({
  name: "Qoneqt Global Feed",
  description: "The main feed of Qoneqt, a community-first social platform where people discover communities and talk about shared interests.",
  audience: "Young Indian internet users, 18 to 30, students, creators and early professionals",
  tone: "Warm, direct, a little witty. Sounds like a smart friend, not a brand.",
  language: "en-IN",
  vocabulary: [],
  topicsToCover: [],
  topicsToAvoid: ["politics", "religion", "medical or financial advice"],
  exampleHooks: ["You have 2,000 followers. How many would notice if you left?", "Nobody tells you this about your first job.", "This one habit quietly kills every group chat."],
  defaultStyle: "cinematic, warm natural light, rich purple and amber tones, shallow depth of field",
  defaultVoice: "",
});

// Stored profiles may be partial, so fill the gaps with defaults.
export function parseCommunityProfile(name: string, profile: unknown): CommunityProfile {
  const parsed = CommunityProfileSchema.safeParse({ ...(typeof profile === "object" && profile ? profile : {}), name });
  return parsed.success ? parsed.data : { ...DEFAULT_COMMUNITY, name };
}

const list = (label: string, items: string[]) => (items.length ? `${label}: ${items.join("; ")}` : "");

export function communityBlock(c: CommunityProfile): string {
  return [
    `COMMUNITY PROFILE`,
    `Name: ${c.name}`,
    c.description && `About: ${c.description}`,
    c.audience && `Audience: ${c.audience}`,
    c.tone && `Tone: ${c.tone}`,
    `Language: ${c.language}`,
    list("Words and phrases they use", c.vocabulary),
    list("Topics to cover", c.topicsToCover),
    list("Topics to avoid", c.topicsToAvoid),
    c.exampleHooks.length ? `Hooks that worked before:\n${c.exampleHooks.map((h) => `- ${h}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
