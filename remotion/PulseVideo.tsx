import React from "react";
import { AbsoluteFill, Audio, Img, Series, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { FPS, type PulseVideoProps, type RenderScene } from "../shared/types";
import { Captions } from "./Captions";

export const sceneFrames = (scene: RenderScene) => Math.max(1, Math.round(scene.durationSec * FPS));

const FONT = "Helvetica, Arial, 'Liberation Sans', sans-serif";

type Palette = { accent: string; second: string; third: string };
// Text sits on dark backgrounds, so a dark accent is mixed with white until it is readable.
function readable(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (!Number.isFinite(luminance) || luminance >= 0.5) return hex;
  const mix = (c: number) => Math.round(c + (255 - c) * 0.55);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

const toPalette = (colors: string[]): Palette => ({
  accent: readable(colors[0] ?? "#a78bfa"),
  second: colors[1] ?? "#7c3aed",
  third: colors[2] ?? "#f59e0b",
});

// Ken Burns motion for image scenes, driven by the Director's `camera`.
function cameraTransform(camera: RenderScene["camera"], progress: number): string {
  switch (camera) {
    case "zoom_in":
      return `scale(${1.05 + 0.15 * progress})`;
    case "zoom_out":
      return `scale(${1.2 - 0.15 * progress})`;
    case "pan_left":
      return `scale(1.16) translateX(${4 - 8 * progress}%)`;
    case "pan_right":
      return `scale(1.16) translateX(${-4 + 8 * progress}%)`;
    default:
      return "scale(1.05)";
  }
}

const ImageScene: React.FC<{ scene: RenderScene; isHook: boolean }> = ({ scene, isHook }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  return (
    <AbsoluteFill>
      <Img
        src={staticFile(scene.imageFile!)}
        style={{ width: "100%", height: "100%", objectFit: "cover", transform: cameraTransform(scene.camera, frame / durationInFrames) }}
      />
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.78) 100%)" }} />
      {/* On-screen text sits below the top 10% safe zone */}
      <div
        style={{
          position: "absolute",
          top: "14%",
          left: 70,
          right: 70,
          textAlign: "center",
          color: "white",
          fontFamily: FONT,
          fontWeight: 900,
          fontSize: isHook ? 110 : 76,
          lineHeight: 1.05,
          textTransform: "uppercase",
          textShadow: "0 6px 30px rgba(0,0,0,0.85)",
        }}
      >
        {scene.onScreenText}
      </div>
    </AbsoluteFill>
  );
};

// Designed scenes: text_card, stat_card and quote_card. No image needed, so they never fail.
const DesignedScene: React.FC<{ scene: RenderScene; palette: Palette; isHook: boolean }> = ({ scene, palette, isHook }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const drift = interpolate(frame, [0, durationInFrames], [0, 60]);
  const enter = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: "clamp" });
  // The hook must be readable from frame 0, so it does not animate in.
  const opacity = isHook ? 1 : enter;
  const lift = isHook ? 0 : (1 - enter) * 40;

  return (
    <AbsoluteFill style={{ backgroundColor: "#0b0616" }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(900px 900px at ${20 + drift / 3}% 18%, ${palette.second}88, transparent 70%), radial-gradient(1000px 1000px at ${85 - drift / 3}% 80%, ${palette.third}55, transparent 70%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "16%",
          bottom: "40%",
          left: 80,
          right: 80,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: scene.layout === "quote_card" ? "flex-start" : "center",
          textAlign: scene.layout === "quote_card" ? "left" : "center",
          opacity,
          transform: `translateY(${lift}px)`,
          fontFamily: FONT,
          color: "white",
        }}
      >
        {scene.layout === "stat_card" && scene.statValue ? (
          <div style={{ fontSize: 300, fontWeight: 900, lineHeight: 1, color: palette.accent, letterSpacing: -8 }}>{scene.statValue}</div>
        ) : null}
        <div
          style={{
            fontSize: scene.layout === "stat_card" ? 72 : isHook ? 128 : 104,
            fontWeight: 900,
            lineHeight: 1.04,
            textTransform: scene.layout === "quote_card" ? "none" : "uppercase",
            borderLeft: scene.layout === "quote_card" ? `14px solid ${palette.accent}` : undefined,
            paddingLeft: scene.layout === "quote_card" ? 44 : 0,
            marginTop: scene.layout === "stat_card" ? 30 : 0,
          }}
        >
          {scene.onScreenText}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Scene: React.FC<{ scene: RenderScene; palette: Palette; isHook: boolean }> = ({ scene, palette, isHook }) => (
  <AbsoluteFill>
    {scene.layout === "full_image" && scene.imageFile ? <ImageScene scene={scene} isHook={isHook} /> : <DesignedScene scene={scene} palette={palette} isHook={isHook} />}
    <Captions words={scene.words} emphasisWords={scene.emphasisWords} accent={palette.accent} />
    <Audio src={staticFile(scene.audioFile)} />
  </AbsoluteFill>
);

export const PulseVideo: React.FC<PulseVideoProps> = ({ scenes, global }) => {
  const palette = toPalette(global?.palette ?? []);
  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <Series>
        {scenes.map((scene, i) => (
          <Series.Sequence key={scene.id} durationInFrames={sceneFrames(scene)}>
            <Scene scene={scene} palette={palette} isHook={i === 0} />
          </Series.Sequence>
        ))}
      </Series>
    </AbsoluteFill>
  );
};
