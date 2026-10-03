// Visual themes. The Director picks one per video, so videos do not all look the same.
import { loadFont as anton } from "@remotion/google-fonts/Anton";
import { loadFont as bricolage } from "@remotion/google-fonts/BricolageGrotesque";
import { loadFont as dmSerif } from "@remotion/google-fonts/DMSerifDisplay";
import { loadFont as spaceGrotesk } from "@remotion/google-fonts/SpaceGrotesk";
import type { ThemeId } from "../shared/types";
import { BRAND, FONT, type Palette } from "./theme";

const FALLBACK = "'Noto Sans', 'Noto Sans Devanagari', 'Noto Sans Gujarati', Helvetica, Arial, sans-serif";
const ANTON = `${anton("normal", { weights: ["400"], subsets: ["latin"] }).fontFamily}, ${FALLBACK}`;
const BRICOLAGE = `${bricolage("normal", { weights: ["600", "800"], subsets: ["latin"] }).fontFamily}, ${FALLBACK}`;
const SERIF = `${dmSerif("normal", { weights: ["400"], subsets: ["latin"] }).fontFamily}, Georgia, serif`;
const SPACE = `${spaceGrotesk("normal", { weights: ["500", "700"], subsets: ["latin"] }).fontFamily}, ${FALLBACK}`;

export type Theme = {
  id: ThemeId;
  titleFont: string;
  titleWeight: number;
  upper: boolean;
  align: "center" | "left";
  captionFont: string;
  captionWeight: number;
  // How image scenes are framed
  image: "full" | "framed" | "duotone" | "sticker";
  // Designed card background and text colors
  cardBackground: (p: Palette, drift: number) => string;
  cardText: string;
  cardLight: boolean;
  titleGlow?: (p: Palette) => string;
  outroBackground: (p: Palette) => string;
  outroText: string;
  // Themes with a fixed color identity replace the Director's palette.
  palette?: (p: Palette) => Palette;
};

const darken = (hex: string, amount: number) => {
  const n = parseInt(hex.replace("#", "").slice(0, 6), 16);
  if (!Number.isFinite(n)) return hex;
  const c = (v: number) => Math.round(v * (1 - amount));
  return `rgb(${c((n >> 16) & 255)}, ${c((n >> 8) & 255)}, ${c(n & 255)})`;
};

export const THEMES: Record<ThemeId, Theme> = {
  midnight: {
    id: "midnight",
    titleFont: FONT,
    titleWeight: 900,
    upper: true,
    align: "center",
    captionFont: FONT,
    captionWeight: 800,
    image: "full",
    cardBackground: (p, d) =>
      [`radial-gradient(900px 900px at ${18 + d * 14}% ${16 + d * 6}%, ${p.second}99, transparent 70%)`, `radial-gradient(1000px 1000px at ${86 - d * 14}% ${82 - d * 6}%, ${p.third}55, transparent 70%)`, BRAND.ink].join(", "),
    cardText: "#ffffff",
    cardLight: false,
    outroBackground: (p) => `radial-gradient(1100px 1100px at 50% 30%, ${BRAND.purple}aa, transparent 70%), radial-gradient(900px 900px at 50% 95%, ${p.third}44, transparent 70%), ${BRAND.ink}`,
    outroText: "#ffffff",
  },
  paper: {
    id: "paper",
    titleFont: BRICOLAGE,
    titleWeight: 800,
    upper: false,
    align: "left",
    captionFont: BRICOLAGE,
    captionWeight: 800,
    image: "framed",
    cardBackground: (_p, d) => `repeating-linear-gradient(180deg, transparent 0 ${118 + d}px, rgba(40,30,20,0.06) ${118 + d}px ${120 + d}px), #f3eee4`,
    cardText: "#17130e",
    cardLight: true,
    outroBackground: () => "#f3eee4",
    outroText: "#17130e",
  },
  neon: {
    id: "neon",
    titleFont: SPACE,
    titleWeight: 700,
    upper: true,
    align: "center",
    captionFont: SPACE,
    captionWeight: 700,
    image: "duotone",
    palette: () => ({ accent: "#3df5ff", second: "#ff3dd4", third: "#7c4dff" }),
    cardBackground: (p) =>
      `linear-gradient(to right, rgba(61,245,255,0.09) 1px, transparent 1px) 0 0 / 90px 90px, linear-gradient(to bottom, rgba(61,245,255,0.09) 1px, transparent 1px) 0 0 / 90px 90px, radial-gradient(800px 800px at 50% 40%, ${p.second}55, transparent 70%), #050507`,
    cardText: "#ffffff",
    cardLight: false,
    titleGlow: (p) => `0 0 12px ${p.accent}, 0 0 34px ${p.accent}, 0 0 70px ${p.second}aa`,
    outroBackground: (p) => `radial-gradient(900px 900px at 50% 35%, ${p.second}55, transparent 70%), #050507`,
    outroText: "#ffffff",
  },
  editorial: {
    id: "editorial",
    titleFont: SERIF,
    titleWeight: 400,
    upper: false,
    align: "left",
    captionFont: FONT,
    captionWeight: 700,
    image: "full",
    cardBackground: (p) => `linear-gradient(160deg, ${darken(p.second, 0.55)} 0%, ${darken(p.second, 0.78)} 100%)`,
    cardText: "#fbf7ef",
    cardLight: false,
    outroBackground: (p) => `linear-gradient(160deg, ${darken(p.second, 0.55)} 0%, ${darken(p.second, 0.8)} 100%)`,
    outroText: "#fbf7ef",
  },
  pop: {
    id: "pop",
    titleFont: ANTON,
    titleWeight: 400,
    upper: true,
    align: "center",
    captionFont: FONT,
    captionWeight: 900,
    image: "sticker",
    cardBackground: (_p, d) => `linear-gradient(${170 + d * 20}deg, #ff9125 0%, #fbdc7b 55%, #fda24a 100%)`,
    cardText: "#141414",
    cardLight: true,
    outroBackground: () => "linear-gradient(170deg, #ff9125 0%, #fbdc7b 55%, #fda24a 100%)",
    outroText: "#141414",
  },
};

const ORDER: ThemeId[] = ["midnight", "paper", "neon", "editorial", "pop"];

// The Director's pick, or a stable choice from the title when there is none.
export function themeFor(id: ThemeId | undefined, title: string): Theme {
  if (id && THEMES[id]) return THEMES[id];
  let h = 0;
  for (const ch of title) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return THEMES[ORDER[h % ORDER.length]];
}
