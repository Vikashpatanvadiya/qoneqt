// "I have my own script": the user's words are kept exactly. Code splits them into scenes;
// the model only adds on-screen text, scene purposes, a title, the closing question and a post caption.
import { z } from "zod";
import type { LlmProvider, LlmResult } from "../providers/llm";
import type { CommunityProfile, Script } from "../schemas";
import { communityBlock } from "./community";

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);

// [img2] or {{image:2}} anywhere in a scene means "use upload 2 here".
const TAG = /\[img(\d{1,2})\]|\{\{\s*image\s*:\s*(\d{1,2})\s*\}\}/gi;

export type SplitScene = { id: string; narration: string; imageTag: number | null };

export function splitScript(text: string): SplitScene[] {
  const clean = text.replace(/\r/g, "").replace(/[ \t]+/g, " ").trim();
  // Sentences, keeping the punctuation.
  let parts = clean.split(/(?<=[.!?])\s+|\n+/).map((p) => p.trim()).filter(Boolean);
  // Fewer than 5 parts: split the longest at a comma, then at its middle word.
  while (parts.length < 5) {
    const i = parts.reduce((best, p, j) => (words(p).length > words(parts[best]).length ? j : best), 0);
    const p = parts[i];
    const w = words(p);
    if (w.length < 6) break;
    const commas = [...p.matchAll(/,\s/g)].map((m) => m.index!);
    let cut = commas.length ? commas.reduce((a, b) => (Math.abs(b - p.length / 2) < Math.abs(a - p.length / 2) ? b : a)) + 1 : -1;
    if (cut <= 0) cut = w.slice(0, Math.ceil(w.length / 2)).join(" ").length;
    parts.splice(i, 1, p.slice(0, cut).trim(), p.slice(cut).trim());
  }
  // More than 8 parts: merge the shortest neighbouring pair.
  while (parts.length > 8) {
    let best = 0;
    for (let j = 0; j < parts.length - 1; j++) if (words(parts[j]).length + words(parts[j + 1]).length < words(parts[best]).length + words(parts[best + 1]).length) best = j;
    parts.splice(best, 2, `${parts[best]} ${parts[best + 1]}`);
  }
  // Very short neighbouring lines (under 10 words together) read better as one scene.
  for (let j = 0; parts.length > 5 && j < parts.length - 1; ) {
    if (words(parts[j]).length + words(parts[j + 1]).length < 10) parts.splice(j, 2, `${parts[j]} ${parts[j + 1]}`);
    else j++;
  }
  return parts.map((p, i) => {
    const tags = [...p.matchAll(TAG)].map((m) => Number(m[1] ?? m[2]));
    return { id: `s${i + 1}`, narration: p.replace(TAG, "").replace(/\s{2,}/g, " ").trim(), imageTag: tags.length ? tags[0] : null };
  });
}

const DressingSchema = z.object({
  title: z.string(),
  cta: z.string().describe("The closing question, taken from the script if it has one"),
  caption: z.string().describe("Post caption with 3 to 5 hashtags"),
  scenes: z.array(z.object({ id: z.string(), purpose: z.enum(["hook", "context", "point", "twist", "cta"]), onScreenText: z.string().describe("Max 6 words, the punchy version of the line") })),
});

const SYSTEM = `You prepare a creator's own script for a vertical video. The narration is final: never rewrite, add or remove narration words.
For each scene give its purpose and onScreenText (max 6 words, the punchy version of that line, not a copy).
Scene 1 is the hook. The last scene is the cta. Give a title, the closing question (cta) and a post caption with 3 to 5 hashtags. Return only JSON.`;

export async function dressOwnScript(llm: LlmProvider, input: { scenes: SplitScene[]; communityProfile: CommunityProfile }): Promise<LlmResult<Script>> {
  const prompt = `${communityBlock(input.communityProfile)}

SCENES (narration is final)
${input.scenes.map((s) => `${s.id}: ${s.narration}`).join("\n")}`;
  const res = await llm.generateJson({ label: "own script", system: SYSTEM, prompt, schema: DressingSchema, tier: "light" });
  const byId = new Map(res.data.scenes.map((s) => [s.id, s]));
  const scenes = input.scenes.map((s, i) => {
    const d = byId.get(s.id);
    const purpose = i === 0 ? "hook" : i === input.scenes.length - 1 ? "cta" : (d?.purpose === "hook" || d?.purpose === "cta" ? "point" : d?.purpose) ?? "point";
    return { id: s.id, purpose, narration: s.narration, onScreenText: d?.onScreenText?.trim() || words(s.narration).slice(0, 5).join(" ") } as Script["scenes"][number];
  });
  const totalWords = scenes.reduce((n, s) => n + words(s.narration).length, 0);
  return {
    ...res,
    data: { title: res.data.title, hook: scenes[0].narration, scenes, cta: res.data.cta, caption: res.data.caption, estDurationSec: Math.round(totalWords / 2.1) },
  };
}
