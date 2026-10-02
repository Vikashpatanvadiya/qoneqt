import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { HIGH_CONTRAST_BACKING_ALPHA, TITLE_LAYOUT, titleBox } from "../../shared/layout";
import type { RenderScene } from "../../shared/types";
import { BACKING, FONT, TEXT_SHADOW } from "../theme";

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

export const ImageScene: React.FC<{ scene: RenderScene; isHook: boolean; frames: number }> = ({ scene, isHook, frames }) => {
  const frame = useCurrentFrame();
  const progress = Math.min(1, frame / frames);
  // The hook is readable from frame 0. Other titles rise in.
  const enter = isHook ? 1 : interpolate(frame, [4, 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const settle = isHook ? interpolate(frame, [0, 10], [1.06, 1], { extrapolateRight: "clamp" }) : 1;

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <Img
        src={staticFile(scene.imageFile!)}
        style={{ width: "100%", height: "100%", objectFit: "cover", transform: cameraTransform(scene.camera, progress), filter: "saturate(1.08) contrast(1.04)" }}
      />
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
          justifyContent: "center",
          opacity: enter,
          transform: `translateY(${(1 - enter) * 30}px) scale(${settle})`,
        }}
      >
        <div
          style={{
            textAlign: "center",
            color: "white",
            fontFamily: FONT,
            fontWeight: 900,
            fontSize: scene.titleFontSize ?? titleBox("image", isHook).fontSize,
            lineHeight: TITLE_LAYOUT.image.lineHeight,
            textTransform: "uppercase",
            textShadow: TEXT_SHADOW,
            // QA gate found this image too bright for white text: put a dark backing behind it
            ...(scene.highContrast ? { backgroundColor: BACKING(HIGH_CONTRAST_BACKING_ALPHA), borderRadius: 28, padding: "18px 30px", margin: "-18px -30px" } : {}),
          }}
        >
          {scene.onScreenText}
        </div>
      </div>
    </AbsoluteFill>
  );
};
