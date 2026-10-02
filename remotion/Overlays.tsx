import React from "react";
import { AbsoluteFill, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

// Thin progress bar at the very top. It helps retention and sits above every scene.
export const ProgressBar: React.FC<{ color: string }> = ({ color }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  return (
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 10, backgroundColor: "rgba(255,255,255,0.18)" }}>
      <div style={{ width: `${(frame / Math.max(1, durationInFrames - 1)) * 100}%`, height: "100%", backgroundColor: color, borderRadius: "0 6px 6px 0" }} />
    </div>
  );
};

// Subtle film grain and a vignette tie AI images and designed cards into one look.
export const FilmLook: React.FC<{ grainFile: string | null }> = ({ grainFile }) => {
  const frame = useCurrentFrame();
  // Shift the grain tile a little every second frame so it moves like film.
  const step = Math.floor(frame / 2);
  const x = (step * 73) % 256;
  const y = (step * 151) % 256;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {grainFile ? <AbsoluteFill style={{ backgroundImage: `url(${staticFile(grainFile)})`, backgroundPosition: `${x}px ${y}px`, opacity: 0.045, mixBlendMode: "overlay" }} /> : null}
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.38) 100%)" }} />
    </AbsoluteFill>
  );
};
