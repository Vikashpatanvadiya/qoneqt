import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { TITLE_LAYOUT, titleBox } from "../../shared/layout";
import type { RenderScene } from "../../shared/types";
import { BRAND, FONT, type Palette } from "../theme";

// Designed scenes: text_card, stat_card and quote_card. No image, so they are free, instant and never fail.

const Background: React.FC<{ palette: Palette; frames: number }> = ({ palette, frames }) => {
  const frame = useCurrentFrame();
  const drift = interpolate(frame, [0, frames], [0, 1]);
  return (
    <AbsoluteFill style={{ backgroundColor: BRAND.ink }}>
      <AbsoluteFill
        style={{
          background: [
            `radial-gradient(900px 900px at ${18 + drift * 14}% ${16 + drift * 6}%, ${palette.second}99, transparent 70%)`,
            `radial-gradient(1000px 1000px at ${86 - drift * 14}% ${82 - drift * 6}%, ${palette.third}55, transparent 70%)`,
            `radial-gradient(700px 700px at 50% 48%, ${BRAND.purple}33, transparent 70%)`,
          ].join(", "),
        }}
      />
    </AbsoluteFill>
  );
};

// Words rise in one after another. On the hook scene everything is visible from frame 0.
const KineticText: React.FC<{ text: string; fontSize: number; instant: boolean; uppercase: boolean; accent: string }> = ({ text, fontSize, instant, uppercase, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = text.split(/\s+/).filter(Boolean);
  const settle = instant ? interpolate(frame, [0, 10], [1.07, 1], { extrapolateRight: "clamp" }) : 1;
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "inherit",
        gap: `0 ${fontSize * 0.26}px`,
        fontSize,
        fontWeight: 900,
        lineHeight: TITLE_LAYOUT.card.lineHeight,
        textTransform: uppercase ? "uppercase" : "none",
        transform: `scale(${settle})`,
      }}
    >
      {words.map((word, i) => {
        const pop = instant ? 1 : spring({ frame: frame - 2 - i * 3, fps, config: { damping: 14, stiffness: 170 } });
        const isLast = i === words.length - 1;
        return (
          <span key={i} style={{ display: "inline-block", opacity: Math.min(1, pop * 1.4), transform: `translateY(${(1 - pop) * 46}px)`, color: isLast && words.length > 2 ? accent : "white" }}>
            {word}
          </span>
        );
      })}
    </div>
  );
};

// "73%" counts up from 0. Anything without a number is shown as is.
const StatValue: React.FC<{ value: string; accent: string }> = ({ value, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const match = value.match(/^(\D*)([\d.,]+)(.*)$/);
  const grow = spring({ frame: frame - 2, fps, config: { damping: 16, stiffness: 120 } });
  let shown = value;
  if (match) {
    const target = Number(match[2].replace(/,/g, ""));
    const decimals = (match[2].split(".")[1] ?? "").length;
    const count = interpolate(frame, [2, 26], [0, target], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    shown = Number.isFinite(target) ? `${match[1]}${count.toFixed(decimals)}${match[3]}` : value;
  }
  return <div style={{ fontSize: 290, fontWeight: 900, lineHeight: 1, color: accent, letterSpacing: -8, transform: `scale(${0.7 + 0.3 * grow})`, fontVariantNumeric: "tabular-nums" }}>{shown}</div>;
};

export const CardScene: React.FC<{ scene: RenderScene; palette: Palette; isHook: boolean; frames: number }> = ({ scene, palette, isHook, frames }) => {
  const frame = useCurrentFrame();
  const isStat = scene.layout === "stat_card" && Boolean(scene.statValue);
  const isQuote = scene.layout === "quote_card";
  const fontSize = scene.titleFontSize ?? titleBox(isStat ? "stat" : "card", isHook).fontSize;
  const bar = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill>
      <Background palette={palette} frames={frames} />
      <div
        style={{
          position: "absolute",
          top: `${TITLE_LAYOUT.card.topPct}%`,
          bottom: `${TITLE_LAYOUT.card.bottomPct}%`,
          left: TITLE_LAYOUT.card.sidePad,
          right: TITLE_LAYOUT.card.sidePad,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: isQuote ? "flex-start" : "center",
          textAlign: isQuote ? "left" : "center",
          fontFamily: FONT,
          color: "white",
        }}
      >
        {isStat ? <StatValue value={scene.statValue!} accent={palette.accent} /> : null}
        {isQuote ? <div style={{ fontSize: 220, fontWeight: 900, lineHeight: 0.6, color: palette.accent, opacity: bar, marginBottom: 10 }}>“</div> : null}
        <div
          style={{
            display: "flex",
            justifyContent: isQuote ? "flex-start" : "center",
            marginTop: isStat ? 34 : 0,
            paddingLeft: isQuote ? 44 : 0,
            borderLeft: isQuote ? `14px solid ${palette.accent}` : undefined,
            clipPath: isQuote ? `inset(0 0 ${(1 - bar) * 100}% 0)` : undefined,
          }}
        >
          <KineticText text={scene.onScreenText} fontSize={fontSize} instant={isHook} uppercase={!isQuote} accent={palette.accent} />
        </div>
      </div>
    </AbsoluteFill>
  );
};
