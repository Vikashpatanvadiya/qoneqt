import { loadFont } from "@remotion/google-fonts/Montserrat";

// Montserrat for Latin text. The system fonts after it cover Hindi and Gujarati on the render machine.
const { fontFamily } = loadFont("normal", { weights: ["600", "800", "900"], subsets: ["latin"] });
export const FONT = `${fontFamily}, 'Noto Sans', 'Noto Sans Devanagari', 'Noto Sans Gujarati', Helvetica, Arial, sans-serif`;

export const BRAND = { purple: "#7c3aed", lilac: "#a78bfa", ink: "#0b0616" };

export type Palette = { accent: string; second: string; third: string };

// Text sits on dark backgrounds, so a dark accent is mixed with white until it is readable.
function readable(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (!Number.isFinite(luminance) || luminance >= 0.5) return hex;
  const mix = (c: number) => Math.round(c + (255 - c) * 0.55);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

export const toPalette = (colors: string[]): Palette => ({
  accent: readable(colors[0] ?? BRAND.lilac),
  second: colors[1] ?? BRAND.purple,
  third: colors[2] ?? "#f59e0b",
});

export const TEXT_SHADOW = "0 4px 18px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,0.9)";
export const BACKING = (alpha: number) => `rgba(8, 4, 18, ${alpha})`;
