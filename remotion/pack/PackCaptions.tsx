// Captions for Style Packs: plain, pill, boxed, bar, kinetic and handwritten, at the pack's position and size.
import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { CAPTION_LAYOUT, fitText } from "../../shared/layout";
import type { RenderScene, WordTiming } from "../../shared/types";
import { captionOnLight, type ResolvedPack, type SceneLook } from "./resolve";
import { Scribble } from "./PackScenes";

const bare = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

// Groups of up to `max` words that also break at punctuation and pauses.
function group(words: WordTiming[], max: number): WordTiming[][] {
  const out: WordTiming[][] = [];
  let cur: WordTiming[] = [];
  words.forEach((w, i) => {
    cur.push(w);
    const next = words[i + 1];
    if (cur.length >= max || /[.!?,;:]$/.test(w.word) || !next || next.startSec - w.endSec > 0.3) {
      out.push(cur);
      cur = [];
    }
  });
  return out;
}

// Emoji for the creator look: matched on the emphasis word, with a fallback by scene role.
const EMOJI: Array<[RegExp, string]> = [
  [/money|rupee|₹|salary|paid|cash|price|cost|rich|earn|lakh|crore|budget/, "💸"],
  [/time|hour|minute|late|deadline|clock|sunday|monday/, "⏰"],
  [/food|eat|snack|chai|tea|coffee|hungry|lunch|dinner/, "🍜"],
  [/phone|app|notification|message|dm|whatsapp|chat|text/, "📱"],
  [/love|heart|friend|crush/, "❤️"],
  [/fast|quick|speed|instant/, "⚡"],
  [/think|idea|smart|learn|study|brain/, "🧠"],
  [/fire|hot|viral|trend/, "🔥"],
  [/sad|cry|tired|stress|broke/, "😩"],
  [/laugh|funny|lol|joke/, "😂"],
  [/win|success|growth|up|grow/, "📈"],
  [/no|never|stop|wrong|fail/, "🚫"],
];
function emojiFor(word: string, purpose: RenderScene["purpose"]): string {
  const b = bare(word);
  for (const [re, e] of EMOJI) if (re.test(b)) return e;
  return purpose === "twist" ? "😳" : purpose === "cta" ? "💬" : purpose === "hook" ? "👀" : "✨";
}

export const PackCaptions: React.FC<{ scene: RenderScene; rp: ResolvedPack; look: SceneLook; index: number }> = ({ scene, rp, look, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const c = rp.spec.captions;
  const groups = group(scene.words, c.maxWordsOnScreen);
  if (groups.length === 0) return null;
  let gi = 0;
  groups.forEach((g, i) => {
    if (g[0].startSec <= t + 0.05) gi = i;
  });
  const words = groups[gi];
  const groupStart = gi === 0 ? 0 : Math.round(words[0].startSec * fps);
  const local = frame - groupStart;
  const emphasis = new Set(scene.emphasisWords.flatMap((w) => w.split(/\s+/)).map(bare).filter(Boolean));
  const onLight = captionOnLight(look, rp);

  // Position: bottom sits above the 20% app safe zone; center is a little higher. Split alternates.
  const pos = c.position === "split" ? (gi % 2 === 0 ? "bottom" : "center") : c.position;
  const bottomPct = pos === "center" ? 34 : pos === "top" ? 40 : CAPTION_LAYOUT.bottomPct;
  const upper = c.style === "bar" || c.style === "kinetic";
  const text = words.map((w) => w.word).join(" ");
  const fit = fitText(text, { maxWidth: 1080 - 2 * CAPTION_LAYOUT.sidePad - 40, maxHeight: 2 * c.size * 1.15, fontSize: c.size, minFontSize: Math.round(c.size * 0.6), lineHeight: 1.15, uppercase: upper });
  const size = Math.min(fit.fontSize, scene.captionFontSize ? Math.max(scene.captionFontSize, c.size * 0.7) : fit.fontSize);

  const enter = c.animation === "none" ? 1 : c.animation === "spring" ? spring({ frame: local, fps, config: { damping: 12, stiffness: 320 } }) : interpolate(local, [0, 6], [0, 1], { extrapolateRight: "clamp" });
  const motion: React.CSSProperties =
    c.animation === "spring" ? { transform: `translateY(${(1 - enter) * 24}px) scale(${0.72 + 0.28 * enter})`, opacity: Math.min(1, enter * 2) } : c.animation === "slide" ? { transform: `translateY(${(1 - enter) * 18}px)`, opacity: enter } : { opacity: enter };

  const ink = onLight ? rp.fg : rp.spec.palette.captionFg;
  const container: React.CSSProperties = { display: "inline-flex", flexWrap: "wrap", justifyContent: "center", gap: `0 ${Math.round(size * 0.28)}px`, fontFamily: rp.caption, fontWeight: rp.spec.fonts.weightBody, fontSize: size, lineHeight: 1.15, textTransform: upper ? "uppercase" : "none", color: ink, ...motion };

  if (c.style === "plain" || c.style === "kinetic") {
    if (!onLight && c.shadow) container.textShadow = "0 3px 14px rgba(0,0,0,0.85), 0 0 2px rgba(0,0,0,0.9)";
    if (!onLight && c.strokeWidth > 0) Object.assign(container, { WebkitTextStroke: `${Math.round(size * c.strokeWidth)}px rgba(0,0,0,0.92)`, paintOrder: "stroke fill" });
  } else if (c.style === "pill") {
    Object.assign(container, { background: rp.spec.palette.captionBg, color: rp.spec.palette.captionFg, borderRadius: 16, padding: "8px 26px 10px" });
  } else if (c.style === "boxed") {
    Object.assign(container, { background: rp.spec.palette.captionBg, color: rp.spec.palette.captionFg, borderRadius: 6, padding: "6px 18px 8px" });
  } else if (c.style === "bar") {
    Object.assign(container, { background: rp.spec.palette.captionBg, color: rp.spec.palette.captionFg, padding: "12px 30px 14px", justifyContent: "flex-start" });
  } else if (c.style === "handwritten") {
    Object.assign(container, { background: rp.spec.palette.captionBg, color: rp.spec.palette.captionFg, padding: "10px 30px 16px", borderRadius: 6, boxShadow: "0 10px 26px rgba(0,0,0,0.18)", transform: `${container.transform ?? ""} rotate(${gi % 2 ? 1.2 : -1.2}deg)` });
  }

  const hit = c.emojiOnHits ? words.find((w) => emphasis.has(bare(w.word)) && w.startSec <= t) : undefined;
  const emojiPop = hit ? spring({ frame: frame - Math.round(hit.startSec * fps), fps, config: { damping: 9, stiffness: 240 } }) : 0;

  return (
    <div style={{ position: "absolute", bottom: `${bottomPct}%`, left: CAPTION_LAYOUT.sidePad, right: CAPTION_LAYOUT.sidePad, display: "flex", justifyContent: c.style === "bar" ? "flex-start" : pos === "center" && c.position === "split" ? "flex-end" : "center" }}>
      {hit ? <div style={{ position: "absolute", left: "50%", bottom: "100%", marginLeft: -70, fontSize: 140, lineHeight: 1, transform: `translateY(${(1 - emojiPop) * 40}px) scale(${emojiPop}) rotate(${(1 - emojiPop) * 20}deg)` }}>{emojiFor(hit.word, scene.purpose)}</div> : null}
      {c.style === "bar" ? <div style={{ alignSelf: "stretch", width: 18, background: rp.accent, marginRight: 0 }} /> : null}
      <div style={container}>
        {words.map((w, i) => {
          const spoken = w.startSec <= t;
          const current = spoken && (words[i + 1] ? words[i + 1].startSec > t : true);
          const isEmphasis = emphasis.has(bare(w.word));
          const style: React.CSSProperties = { display: "inline-block", position: "relative" };
          if (c.style === "kinetic") {
            const bounce = spring({ frame: frame - Math.round(w.startSec * fps), fps, config: { damping: 9, stiffness: 260 } });
            const scale = current ? 1 + (isEmphasis ? 0.16 : 0.08) * bounce : 1;
            Object.assign(style, { opacity: spoken ? 1 : 0.55, transform: `scale(${scale})`, margin: scale > 1 ? `0 ${Math.round(size * (scale - 1) * 1.6)}px` : 0, color: isEmphasis || current ? rp.spec.palette.highlight : ink });
          } else if (c.style === "plain") {
            Object.assign(style, { opacity: spoken ? 1 : 0.7, color: isEmphasis ? (onLight ? rp.accent : rp.spec.palette.highlight) : ink });
          } else if (c.style === "handwritten") {
            style.opacity = spoken ? 1 : 0.6;
          } else {
            style.opacity = spoken ? 1 : 0.75;
            if (isEmphasis && c.style === "bar") style.color = rp.accent === rp.spec.palette.captionBg ? "#ffe14d" : rp.accent;
          }
          const mark = isEmphasis && spoken ? interpolate(frame - Math.round(w.startSec * fps), [0, 10], [0, 1], { extrapolateRight: "clamp" }) : 0;
          return (
            <span key={i} style={style}>
              {w.word}
              {c.style === "handwritten" && isEmphasis ? <Scribble color={rp.accent} progress={mark} /> : null}
            </span>
          );
        })}
      </div>
    </div>
  );
};
