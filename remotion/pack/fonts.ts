// Google Fonts (all SIL Open Font License, see docs/FONT-LICENSES.md) loaded on demand.
// A pack loads at most 2 families, so a render only waits for the fonts it uses.
import { loadFont as anton } from "@remotion/google-fonts/Anton";
import { loadFont as archivo } from "@remotion/google-fonts/Archivo";
import { loadFont as archivoBlack } from "@remotion/google-fonts/ArchivoBlack";
import { loadFont as bricolage } from "@remotion/google-fonts/BricolageGrotesque";
import { loadFont as caveat } from "@remotion/google-fonts/Caveat";
import { loadFont as cormorant } from "@remotion/google-fonts/CormorantGaramond";
import { loadFont as courierPrime } from "@remotion/google-fonts/CourierPrime";
import { loadFont as fraunces } from "@remotion/google-fonts/Fraunces";
import { loadFont as instrumentSerif } from "@remotion/google-fonts/InstrumentSerif";
import { loadFont as inter } from "@remotion/google-fonts/Inter";
import { loadFont as interTight } from "@remotion/google-fonts/InterTight";
import { loadFont as jetbrains } from "@remotion/google-fonts/JetBrainsMono";
import { loadFont as montserrat } from "@remotion/google-fonts/Montserrat";
import { loadFont as newsreader } from "@remotion/google-fonts/Newsreader";
import { loadFont as patrickHand } from "@remotion/google-fonts/PatrickHand";
import { loadFont as spaceMono } from "@remotion/google-fonts/SpaceMono";
import type { FontKey } from "../../src/styles/packs/types";

type Loader = (style: "normal", options: { weights: string[]; subsets: string[] }) => { fontFamily: string };

const REGISTRY: Record<FontKey, { load: Loader; weights: string[]; fallback: string }> = {
  Montserrat: { load: montserrat as Loader, weights: ["700", "800", "900"], fallback: "sans-serif" },
  Inter: { load: inter as Loader, weights: ["500", "600", "700", "800"], fallback: "sans-serif" },
  InterTight: { load: interTight as Loader, weights: ["600", "800"], fallback: "sans-serif" },
  Archivo: { load: archivo as Loader, weights: ["600", "800"], fallback: "sans-serif" },
  ArchivoBlack: { load: archivoBlack as Loader, weights: ["400"], fallback: "sans-serif" },
  BricolageGrotesque: { load: bricolage as Loader, weights: ["600", "800"], fallback: "sans-serif" },
  CormorantGaramond: { load: cormorant as Loader, weights: ["400", "600"], fallback: "Georgia, serif" },
  InstrumentSerif: { load: instrumentSerif as Loader, weights: ["400"], fallback: "Georgia, serif" },
  Newsreader: { load: newsreader as Loader, weights: ["500", "600"], fallback: "Georgia, serif" },
  Fraunces: { load: fraunces as Loader, weights: ["600", "800"], fallback: "Georgia, serif" },
  JetBrainsMono: { load: jetbrains as Loader, weights: ["500", "700"], fallback: "monospace" },
  SpaceMono: { load: spaceMono as Loader, weights: ["400", "700"], fallback: "monospace" },
  CourierPrime: { load: courierPrime as Loader, weights: ["400", "700"], fallback: "'Courier New', monospace" },
  Caveat: { load: caveat as Loader, weights: ["600", "700"], fallback: "cursive" },
  PatrickHand: { load: patrickHand as Loader, weights: ["400"], fallback: "cursive" },
  Anton: { load: anton as Loader, weights: ["400"], fallback: "Impact, sans-serif" },
};

// Hindi and Gujarati fall back to the Noto fonts on the render machine.
const SCRIPTS = "'Noto Sans', 'Noto Sans Devanagari', 'Noto Sans Gujarati', 'Apple Color Emoji', 'Noto Color Emoji'";
const loaded = new Map<FontKey, string>();

export function fontStack(key: FontKey): string {
  const cached = loaded.get(key);
  if (cached) return cached;
  const entry = REGISTRY[key] ?? REGISTRY.Inter;
  const { fontFamily } = entry.load("normal", { weights: entry.weights, subsets: ["latin"] });
  const stack = `${fontFamily}, ${SCRIPTS}, ${entry.fallback}`;
  loaded.set(key, stack);
  return stack;
}
