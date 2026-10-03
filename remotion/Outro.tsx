import React from "react";
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { FONT, type Palette } from "./theme";
import type { Theme } from "./themes";

// 1.5 sec end card: Qoneqt mark, community name and the question to answer in the comments.
export const Outro: React.FC<{ communityName: string; cta: string; logoFile: string | null; palette: Palette; theme: Theme }> = ({ communityName, cta, logoFile, palette, theme }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 14, stiffness: 160 } });
  const rise = interpolate(frame, [4, 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const ctaSize = cta.length > 70 ? 54 : cta.length > 45 ? 64 : 76;

  return (
    <AbsoluteFill style={{ background: theme.outroBackground(palette), fontFamily: FONT, color: theme.outroText }}>
      {/* Everything stays between the top 10% and bottom 20% safe zones */}
      <div style={{ position: "absolute", top: "16%", bottom: "24%", left: 80, right: 80, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
        <div style={{ transform: `scale(${0.8 + 0.2 * pop})`, opacity: Math.min(1, pop * 1.5) }}>
          {logoFile ? <Img src={staticFile(logoFile)} style={{ height: 150 }} /> : <div style={{ fontSize: 150, fontWeight: 900, letterSpacing: -4, fontFamily: theme.titleFont }}>Qoneqt</div>}
        </div>
        <div style={{ marginTop: 26, fontSize: 44, fontWeight: 600, color: theme.cardLight ? theme.outroText : palette.accent, opacity: rise, letterSpacing: 1 }}>{communityName}</div>
        <div style={{ marginTop: 110, fontSize: ctaSize, fontFamily: theme.titleFont, fontWeight: theme.titleWeight >= 700 ? theme.titleWeight : 800, lineHeight: 1.15, opacity: rise, transform: `translateY(${(1 - rise) * 30}px)` }}>{cta}</div>
        <div style={{ marginTop: 70, fontSize: 40, fontWeight: 600, opacity: rise * 0.85, border: `3px solid ${theme.cardLight ? theme.outroText : palette.accent}`, borderRadius: 999, padding: "14px 38px" }}>Tell us in the comments</div>
      </div>
    </AbsoluteFill>
  );
};
