import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { HIGH_CONTRAST_BACKING_ALPHA, TITLE_LAYOUT, titleBox } from "../../shared/layout";
import type { RenderScene } from "../../shared/types";
import { BACKING, TEXT_SHADOW, type Palette } from "../theme";
import type { Theme } from "../themes";

// Ken Burns motion, driven by the Director's `camera`.
function cameraTransform(camera: RenderScene["camera"], progress: number): string {
  switch (camera) {
    case "zoom_in":
      return `scale(${1.06 + 0.16 * progress})`;
    case "zoom_out":
      return `scale(${1.22 - 0.16 * progress})`;
    case "pan_left":
      return `scale(1.18) translateX(${4 - 8 * progress}%)`;
    case "pan_right":
      return `scale(1.18) translateX(${-4 + 8 * progress}%)`;
    default:
      return "scale(1.06)";
  }
}

// `imageTransform` replaces the Ken Burns move (the creator edit computes its own eased camera).
export const ImageScene: React.FC<{ scene: RenderScene; isHook: boolean; frames: number; theme: Theme; palette: Palette; imageTransform?: string; titleAlreadyIn?: boolean }> = ({ scene, isHook, frames, theme, palette, imageTransform, titleAlreadyIn }) => {
  const frame = useCurrentFrame();
  const progress = Math.min(1, frame / frames);
  // The hook is readable from frame 0. Other titles rise in.
  const enter = isHook || titleAlreadyIn ? 1 : interpolate(frame, [4, 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const settle = isHook ? interpolate(frame, [0, 10], [1.06, 1], { extrapolateRight: "clamp" }) : 1;
  const fontSize = scene.titleFontSize ?? titleBox("image", isHook).fontSize;
  const image = <Img src={staticFile(scene.imageFile!)} style={{ width: "100%", height: "100%", objectFit: "cover", transform: imageTransform ?? cameraTransform(scene.camera, progress), filter: theme.image === "duotone" ? "grayscale(1) contrast(1.2) brightness(1.15)" : "saturate(1.08) contrast(1.04)" }} />;

  // Paper: the photo sits in a white frame on the paper, the title is a label on top of it.
  if (theme.image === "framed") {
    const tilt = scene.id.charCodeAt(scene.id.length - 1) % 2 === 0 ? -1.4 : 1.2;
    return (
      <AbsoluteFill style={{ background: theme.cardBackground(palette, progress) }}>
        <div style={{ position: "absolute", left: 70, right: 70, top: "11%", bottom: "38%", background: "#fffdf8", padding: 18, borderRadius: 22, boxShadow: "0 30px 60px rgba(40,30,20,0.25)", transform: `rotate(${tilt}deg)` }}>
          <div style={{ width: "100%", height: "100%", overflow: "hidden", borderRadius: 10 }}>{image}</div>
        </div>
        <div style={{ position: "absolute", top: `${TITLE_LAYOUT.image.topPct}%`, left: 100, right: 100, display: "flex", opacity: enter, transform: `translateY(${(1 - enter) * 30}px) scale(${settle})` }}>
          <div style={{ background: "#fffdf8", color: theme.cardText, fontFamily: theme.titleFont, fontWeight: theme.titleWeight, fontSize: fontSize * 0.86, lineHeight: 1.05, padding: "14px 24px", borderRadius: 16, boxShadow: "0 10px 30px rgba(0,0,0,0.18)", borderLeft: `12px solid ${palette.accent}` }}>
            {scene.onScreenText}
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  const sticker = theme.image === "sticker";
  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {image}
      {/* Neon: grayscale image tinted with the palette, for a duotone look */}
      {theme.image === "duotone" ? <AbsoluteFill style={{ background: `linear-gradient(160deg, ${palette.second}, ${palette.accent})`, mixBlendMode: "color", opacity: 0.95 }} /> : null}
      {/* Keep in sync with scrimAlphaAt() in shared/layout.ts, which the QA gate uses to measure contrast */}
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.78) 100%)" }} />
      {/* On-screen text sits below the top 10% safe zone */}
      <div
        style={{
          position: "absolute",
          top: `${TITLE_LAYOUT.image.topPct}%`,
          left: TITLE_LAYOUT.image.sidePad,
          right: TITLE_LAYOUT.image.sidePad,
          display: "flex",
          justifyContent: theme.align === "left" ? "flex-start" : "center",
          opacity: enter,
          transform: `translateY(${(1 - enter) * 30}px) scale(${settle}) ${sticker ? "rotate(-2.5deg)" : ""}`,
        }}
      >
        <div
          style={{
            textAlign: theme.align,
            color: sticker ? "#141414" : "white",
            fontFamily: theme.titleFont,
            fontWeight: theme.titleWeight,
            fontSize: sticker ? fontSize * 1.1 : fontSize,
            lineHeight: theme.titleFont.includes("Serif") ? 1.08 : 1.02,
            textTransform: theme.upper ? "uppercase" : "none",
            textShadow: sticker ? "none" : theme.titleGlow ? theme.titleGlow(palette) : TEXT_SHADOW,
            ...(sticker ? { backgroundColor: palette.accent, padding: "10px 26px 6px", borderRadius: 10, boxShadow: "6px 6px 0 #141414" } : {}),
            ...(theme.id === "editorial" ? { borderLeft: `8px solid ${palette.accent}`, paddingLeft: 28 } : {}),
            // QA gate found this image too bright for white text: put a dark backing behind it
            ...(scene.highContrast && !sticker ? { backgroundColor: BACKING(HIGH_CONTRAST_BACKING_ALPHA), borderRadius: 28, padding: "18px 30px", margin: "-18px -30px" } : {}),
          }}
        >
          {scene.onScreenText}
        </div>
      </div>
    </AbsoluteFill>
  );
};
