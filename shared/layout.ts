// Layout numbers shared by the Remotion composition and the code QA gate,
// so the QA gate checks the same boxes the renderer draws.
export const FRAME = { width: 1080, height: 1920 };

// App UI covers these parts of the frame. No text may sit inside them.
export const SAFE_ZONE = { topPct: 10, bottomPct: 20 };

export const CAPTION_LAYOUT = {
  bottomPct: 27,
  sidePad: 60,
  fontSize: 74,
  minFontSize: 50,
  lineHeight: 1.15,
  wordGap: 22,
  wordsPerGroup: 3,
  maxLines: 2,
};

export const TITLE_LAYOUT = {
  // On-screen text over an image: starts under the top safe zone and must end above the middle of the frame.
  image: { topPct: 14, maxBottomPct: 45, sidePad: 70, fontSize: 76, hookFontSize: 110, lineHeight: 1.05, uppercase: true },
  // Designed cards: text is centred in this box.
  card: { topPct: 16, bottomPct: 40, sidePad: 80, fontSize: 104, hookFontSize: 128, statLabelFontSize: 72, statValueHeight: 330, lineHeight: 1.04 },
  minScale: 0.5,
};

// Scrim drawn over image scenes, as black opacity at a given height (0 = top of frame, 100 = bottom).
export function scrimAlphaAt(yPct: number): number {
  if (yPct <= 30) return 0.5 * (1 - yPct / 30);
  if (yPct >= 45) return 0.78 * ((yPct - 45) / 55);
  return 0;
}
export const HIGH_CONTRAST_BACKING_ALPHA = 0.62;

// Rough glyph widths for a bold sans font, in em. Good enough to catch overflow before rendering.
function charWidthEm(ch: string, uppercase: boolean): number {
  if (ch === " ") return 0.28;
  if (/[ilI.,'!:;|]/.test(ch)) return 0.3;
  if (/[mwMW@%]/.test(ch)) return 0.88;
  if (uppercase || /[A-Z0-9?#&]/.test(ch)) return 0.68;
  return 0.56;
}

export function textWidth(text: string, fontSize: number, uppercase = false): number {
  const s = uppercase ? text.toUpperCase() : text;
  let em = 0;
  for (const ch of s) em += charWidthEm(ch, uppercase);
  return em * fontSize;
}

// Greedy word wrap. Returns the line count and whether any single word is wider than the box.
export function wrap(text: string, fontSize: number, maxWidth: number, uppercase = false, gap?: number): { lines: number; wordOverflow: boolean } {
  const space = gap ?? textWidth(" ", fontSize, uppercase);
  let lines = 1;
  let lineWidth = 0;
  let wordOverflow = false;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const w = textWidth(word, fontSize, uppercase);
    if (w > maxWidth) wordOverflow = true;
    if (lineWidth > 0 && lineWidth + space + w > maxWidth) {
      lines++;
      lineWidth = w;
    } else {
      lineWidth += (lineWidth > 0 ? space : 0) + w;
    }
  }
  return { lines, wordOverflow };
}

export type Fit = { fontSize: number; lines: number; heightPx: number; fits: boolean };

// Largest font size, from `fontSize` down to `minFontSize`, at which the text fits the box.
export function fitText(text: string, box: { maxWidth: number; maxHeight: number; fontSize: number; minFontSize: number; lineHeight: number; uppercase?: boolean; gap?: number }): Fit {
  let size = box.fontSize;
  for (;;) {
    const { lines, wordOverflow } = wrap(text, size, box.maxWidth, box.uppercase, box.gap);
    const heightPx = lines * size * box.lineHeight;
    const fits = !wordOverflow && heightPx <= box.maxHeight;
    if (fits || size <= box.minFontSize) return { fontSize: size, lines, heightPx, fits };
    size = Math.max(box.minFontSize, Math.floor(size * 0.94));
  }
}

export type TitleKind = "image" | "card" | "stat";

// The box and starting font size for a scene's on-screen text.
export function titleBox(kind: TitleKind, isHook: boolean) {
  const { image, card, minScale } = TITLE_LAYOUT;
  if (kind === "image") {
    const fontSize = isHook ? image.hookFontSize : image.fontSize;
    return {
      maxWidth: FRAME.width - image.sidePad * 2,
      maxHeight: ((image.maxBottomPct - image.topPct) / 100) * FRAME.height,
      fontSize,
      minFontSize: Math.round(fontSize * minScale),
      lineHeight: image.lineHeight,
      uppercase: true,
      topPx: (image.topPct / 100) * FRAME.height,
    };
  }
  const boxHeight = ((100 - card.topPct - card.bottomPct) / 100) * FRAME.height;
  const fontSize = kind === "stat" ? card.statLabelFontSize : isHook ? card.hookFontSize : card.fontSize;
  return {
    maxWidth: FRAME.width - card.sidePad * 2,
    maxHeight: kind === "stat" ? boxHeight - card.statValueHeight : boxHeight,
    fontSize,
    minFontSize: Math.round(fontSize * minScale),
    lineHeight: card.lineHeight,
    uppercase: true,
    topPx: (card.topPct / 100) * FRAME.height,
  };
}
