import { boldPoster } from "./boldPoster";
import { creatorPop } from "./creatorPop";
import { explainerUi } from "./explainerUi";
import { highlighterDoc } from "./highlighterDoc";
import { journal } from "./journal";
import { labNotes } from "./labNotes";
import { portraitMono } from "./portraitMono";
import { studioAd } from "./studioAd";
import type { StylePack } from "./types";

export type { StylePack } from "./types";

export const PACK_IDS = ["lab_notes", "studio_ad", "explainer_ui", "highlighter_doc", "bold_poster", "portrait_mono", "creator_pop", "journal"] as const;
export type PackId = (typeof PACK_IDS)[number];

export const PACKS: Record<PackId, StylePack> = {
  lab_notes: labNotes,
  studio_ad: studioAd,
  explainer_ui: explainerUi,
  highlighter_doc: highlighterDoc,
  bold_poster: boldPoster,
  portrait_mono: portraitMono,
  creator_pop: creatorPop,
  journal,
};

export const isPackId = (v: unknown): v is PackId => typeof v === "string" && (PACK_IDS as readonly string[]).includes(v);
export const packById = (id: unknown): StylePack | undefined => (isPackId(id) ? PACKS[id] : undefined);

// One accent per video, picked from the pack's accents by a stable hash of the title, so videos in one pack still differ.
export function packAccent(pack: StylePack, seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return pack.palette.accent[h % pack.palette.accent.length];
}
