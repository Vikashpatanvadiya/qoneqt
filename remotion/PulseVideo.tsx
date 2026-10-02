import React from "react";
import { AbsoluteFill, Audio, Img, Series, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { FPS, type PulseVideoProps, type RenderScene } from "../shared/types";
import { Captions } from "./Captions";

export const sceneFrames = (scene: RenderScene) => Math.max(1, Math.round(scene.durationSec * FPS));

const Scene: React.FC<{ scene: RenderScene; isHook: boolean }> = ({ scene, isHook }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const scale = interpolate(frame, [0, durationInFrames], [1.05, 1.18]);

  return (
    <AbsoluteFill style={{ background: "linear-gradient(160deg, #2a0a5e 0%, #7c3aed 55%, #1a0633 100%)" }}>
      {scene.imageFile ? (
        <Img src={staticFile(scene.imageFile)} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${scale})` }} />
      ) : null}
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.75) 100%)" }} />

      {/* On-screen text sits below the top 10% safe zone */}
      <div
        style={{
          position: "absolute",
          top: "14%",
          left: 70,
          right: 70,
          textAlign: "center",
          color: "white",
          fontFamily: "Helvetica, Arial, sans-serif",
          fontWeight: 900,
          fontSize: isHook ? 110 : 76,
          lineHeight: 1.05,
          textTransform: "uppercase",
          textShadow: "0 6px 30px rgba(0,0,0,0.85)",
        }}
      >
        {scene.onScreenText}
      </div>

      <Captions words={scene.words} />
      <Audio src={staticFile(scene.audioFile)} />
    </AbsoluteFill>
  );
};

export const PulseVideo: React.FC<PulseVideoProps> = ({ scenes }) => (
  <AbsoluteFill style={{ backgroundColor: "black" }}>
    <Series>
      {scenes.map((scene, i) => (
        <Series.Sequence key={scene.id} durationInFrames={sceneFrames(scene)}>
          <Scene scene={scene} isHook={i === 0} />
        </Series.Sequence>
      ))}
    </Series>
  </AbsoluteFill>
);
