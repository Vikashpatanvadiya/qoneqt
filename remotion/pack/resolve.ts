import { PACKS, isPackId, packAccent, type PackId, type StylePack } from "../../src/styles/packs";
import type { ImageLayout, CardLayout, StatLayout, TransitionKind } from "../../src/styles/packs/types";
import type { RenderScene } from "../../shared/types";
import { fontStack } from "./fonts";

// A pack with its fonts loaded and one accent chosen for this video.
export type ResolvedPack = {
  spec: StylePack;
  heading: string;
  body: string;
  caption: string;
  accent: string;
  bg: string;
  bg2: string;
  fg: string;
  fg2: string;
  light: boolean;
};

export function resolvePack(id: PackId | string | undefined, seed: string): ResolvedPack | undefined {
  if (!isPackId(id)) return undefined;
  const spec = PACKS[id];
  return {
    spec,
    heading: fontStack(spec.fonts.heading),
    body: fontStack(spec.fonts.body),
    caption: fontStack(spec.fonts.caption),
    accent: packAccent(spec, seed),
    bg: spec.palette.bg[0],
    bg2: spec.palette.bg[1] ?? spec.palette.bg[0],
    fg: spec.palette.fg[0],
    fg2: spec.palette.fg[1] ?? spec.palette.fg[0],
    light: spec.surface === "light",
  };
}

export type SceneLook = { kind: "card"; layout: CardLayout | StatLayout } | { kind: "image"; layout: ImageLayout | "image_stat" };

// Which layout a scene gets. Deterministic, so captions, sound and QA agree with the picture.
export function sceneLook(scene: RenderScene, index: number, total: number, spec: StylePack): SceneLook {
  const hasImage = scene.layout === "full_image" && Boolean(scene.imageFile);
  const isCta = scene.purpose === "cta" || index === total - 1;
  if (hasImage) {
    if (spec.layouts.statLayout === "image_stat" && scene.statValue) return { kind: "image", layout: "image_stat" };
    const list = spec.layouts.pointLayout;
    return { kind: "image", layout: index === 0 && list.includes("full") ? "full" : list[index % list.length] };
  }
  if (scene.layout === "stat_card" && scene.statValue) return { kind: "card", layout: spec.layouts.statLayout === "image_stat" ? "stat" : spec.layouts.statLayout };
  if (index === 0) return { kind: "card", layout: spec.layouts.hookLayout };
  if (isCta) return { kind: "card", layout: spec.layouts.ctaLayout };
  if (scene.layout === "quote_card") return { kind: "card", layout: "quote" };
  const list = spec.layouts.cardLayout;
  return { kind: "card", layout: list[index % list.length] };
}

// Text sits on a light surface (needs dark ink) unless the image fills the frame behind it.
export function captionOnLight(look: SceneLook, rp: ResolvedPack): boolean {
  if (!rp.light) return false;
  if (look.kind === "image") return look.layout !== "full" && look.layout !== "image_stat";
  return true;
}

// Transitions come from the pack's set, never the same non-cut kind three times in a row.
export function packTransitions(count: number, set: TransitionKind[]): TransitionKind[] {
  const kinds: TransitionKind[] = [];
  for (let i = 0; i < count; i++) {
    if (i === 0) {
      kinds.push("cut");
      continue;
    }
    let k = set[(i - 1) % set.length];
    let step = 0;
    while (k !== "cut" && kinds.length >= 2 && kinds[kinds.length - 1] === k && kinds[kinds.length - 2] === k && step < set.length) k = set[(i + ++step) % set.length];
    kinds.push(k);
  }
  return kinds;
}
