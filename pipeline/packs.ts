// Style Pack choice for the pipeline: what the Director is told, how its pick is locked, and what gets logged.
import { PACKS, PACK_IDS, isPackId, packAccent, packById, type PackId } from "../src/styles/packs";
import type { ShotPlan } from "./schemas";

// Prompt block listing every pack, for the Director.
export function packMenu(): string {
  return PACK_IDS.map((id) => `  ${id}: ${PACKS[id].name}. ${PACKS[id].mood}. Use for ${PACKS[id].useFor}.`).join("\n");
}

// The pack is decided once, right after the Director, and never changes for this job (retries, vision fixes and edits reuse it).
// 1. The user's pick wins. 2. The Director's pick, unless it repeats this user's last pack. 3. The best other pack for the emotion.
export function lockPack(input: { directorPick: unknown; userPick: unknown; lastPack: unknown; emotion?: string; seed: string }): { packId: PackId; reason: string } {
  if (isPackId(input.userPick)) return { packId: input.userPick, reason: `${PACKS[input.userPick].name}: chosen on the Create page` };
  const last = isPackId(input.lastPack) ? input.lastPack : undefined;
  if (isPackId(input.directorPick) && input.directorPick !== last) return { packId: input.directorPick, reason: `${PACKS[input.directorPick].name}: picked by the Director` };
  let h = 0;
  for (const ch of input.seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const rotated = [...PACK_IDS.slice(h % PACK_IDS.length), ...PACK_IDS.slice(0, h % PACK_IDS.length)].filter((id) => id !== last);
  const byEmotion = rotated.find((id) => PACKS[id].emotions.includes(input.emotion as never));
  const packId = byEmotion ?? rotated[0];
  const why = isPackId(input.directorPick) ? `the Director picked ${PACKS[input.directorPick].name} again, which this user's last video used` : "the Director did not pick a pack";
  return { packId, reason: `${PACKS[packId].name}: ${why}, so a different pack that fits "${input.emotion ?? "the topic"}" was used` };
}

// Puts the locked pack into the plan: pack palette and a music mood the pack allows.
export function applyPack(plan: ShotPlan, packId: PackId, seed: string): ShotPlan {
  const pack = PACKS[packId];
  const accent = packAccent(pack, seed);
  const palette = [accent, ...pack.palette.accent.filter((c) => c !== accent), ...pack.palette.bg].slice(0, 4);
  const musicMood = pack.musicMoods.includes(plan.global.musicMood) ? plan.global.musicMood : pack.musicMoods[0];
  return { ...plan, global: { ...plan.global, packId, palette, musicMood } };
}

// Image grade: the pack's grade, or the legacy theme for old plans.
export function gradeKey(global: ShotPlan["global"]): string | undefined {
  return packById(global.packId)?.imageTreatment.grade ?? global.theme;
}

export function styleNoteFor(packId: unknown): string | undefined {
  const p = packById(packId);
  if (!p) return undefined;
  return `${p.name} (${p.mood}). Fonts: ${p.fonts.heading} headings, ${p.fonts.caption} captions. Colours: background ${p.palette.bg.join(", ")}, accents ${p.palette.accent.join(", ")}. Captions: ${p.captions.style}.`;
}

// What the Job page and Library show.
export function packLog(global: ShotPlan["global"]) {
  const p = packById(global.packId);
  if (!p) return null;
  return { id: p.id, name: p.name, fonts: [...new Set([p.fonts.heading, p.fonts.body, p.fonts.caption])], palette: global.palette, captionStyle: p.captions.style, transitions: [...new Set(p.motion.transitionSet)], camera: p.motion.camera };
}
