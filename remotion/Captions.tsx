import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { CAPTION_LAYOUT, HIGH_CONTRAST_BACKING_ALPHA, groupWords } from "../shared/layout";
import type { RenderScene } from "../shared/types";
import { BACKING, TEXT_SHADOW } from "./theme";
import type { Theme } from "./themes";

const bare = (word: string) => word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

// Word-by-word captions for one scene. `frame` counts from the start of the scene.
// Styles: pop (scale bounce on the spoken word), karaoke (words fill with the accent color), minimal.
export const Captions: React.FC<{ scene: RenderScene; accent: string; theme: Theme; creator?: boolean }> = ({ scene, accent, theme, creator }) => {
  // Light backgrounds (paper, pop cards) need dark caption text.
  const onLight = scene.layout === "full_image" && scene.imageFile ? theme.image === "framed" : theme.cardLight;
  const ink = onLight ? "#141414" : "white";
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const groups = groupWords(scene.words);
  if (groups.length === 0) return null;

  // The visible group is the last one whose first word has started.
  let groupIndex = 0;
  groups.forEach((g, i) => {
    if (g[0].startSec <= t + 0.05) groupIndex = i;
  });
  const group = groups[groupIndex];
  const emphasis = new Set(scene.emphasisWords.flatMap((w) => w.split(/\s+/)).map(bare).filter(Boolean));

  const style = scene.captionStyle;
  const baseSize = style === "minimal" ? 60 : style === "karaoke" ? 70 : CAPTION_LAYOUT.fontSize;
  const fontSize = Math.min(baseSize, scene.captionFontSize ?? baseSize);
  // The first group is on screen from frame 0, so the hook caption pops immediately.
  const groupStart = groupIndex === 0 ? 0 : Math.round(group[0].startSec * fps);
  const groupIn = spring({ frame: frame - groupStart, fps, config: creator ? { damping: 12, stiffness: 320 } : { damping: 18, stiffness: 240 } });
  // Karaoke always sits on a pill. Other styles get one only when the QA gate asks for it.
  const backing = onLight ? 0 : style === "karaoke" ? 0.55 : scene.highContrast ? HIGH_CONTRAST_BACKING_ALPHA : 0;

  return (
    // Sits above the bottom 20% safe zone
    <div style={{ position: "absolute", bottom: `${CAPTION_LAYOUT.bottomPct}%`, left: CAPTION_LAYOUT.sidePad, right: CAPTION_LAYOUT.sidePad, display: "flex", justifyContent: "center" }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: `0 ${CAPTION_LAYOUT.wordGap}px`,
          fontFamily: theme.captionFont,
          fontWeight: style === "minimal" ? 600 : theme.captionWeight,
          fontSize,
          lineHeight: CAPTION_LAYOUT.lineHeight,
          textShadow: onLight ? "none" : theme.titleGlow && style !== "minimal" ? `${TEXT_SHADOW}, 0 0 16px ${accent}66` : TEXT_SHADOW,
          // Creator look: a heavy outline under the fill and a springy pop-in for every new group.
          ...(creator && !onLight ? { WebkitTextStroke: `${Math.round(fontSize * 0.11)}px rgba(0,0,0,0.92)`, paintOrder: "stroke fill" } : {}),
          transform: creator ? `translateY(${(1 - groupIn) * 26}px) scale(${0.7 + 0.3 * groupIn})` : `scale(${style === "minimal" ? 1 : 0.94 + 0.06 * groupIn})`,
          opacity: creator ? Math.min(1, groupIn * 2) : 1,
          ...(backing ? { backgroundColor: BACKING(backing), borderRadius: 26, padding: "10px 28px" } : {}),
        }}
      >
        {group.map((w, i) => {
          const spoken = w.startSec <= t;
          const isCurrent = spoken && (group[i + 1] ? group[i + 1].startSec > t : true);
          const isEmphasis = emphasis.has(bare(w.word));
          const bounce = spring({ frame: frame - Math.round(w.startSec * fps), fps, config: { damping: 9, stiffness: 260 } });

          let color = isEmphasis && !onLight ? accent : ink;
          if (creator && isEmphasis && !onLight) color = theme.id === "pop" ? "#ffe14d" : accent;
          let opacity = 1;
          let scale = 1;
          if (style === "pop") {
            opacity = spoken ? 1 : 0.55;
            scale = isCurrent ? 1 + (isEmphasis ? (creator ? 0.14 : 0.1) : 0.07) * bounce : 1;
          } else if (style === "karaoke") {
            color = spoken ? (onLight ? ink : accent) : ink;
            opacity = spoken ? 1 : 0.7;
          } else {
            opacity = isCurrent ? 1 : 0.62;
          }
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                color,
                opacity,
                transform: `scale(${scale})`,
                // Room for the scaled word, so it never touches its neighbours
                margin: scale > 1 ? `0 ${Math.round(fontSize * (scale - 1) * 1.6)}px` : 0,
                // On light backgrounds emphasis (and karaoke progress) is a highlighter stroke, not a color
                ...(onLight && (isEmphasis || (style === "karaoke" && spoken)) ? { background: `linear-gradient(transparent 52%, ${accent}bb 52%)`, padding: "0 4px" } : {}),
              }}
            >
              {w.word}
            </span>
          );
        })}
      </div>
    </div>
  );
};
