import React from "react";
import { Composition } from "remotion";
import { FPS, HEIGHT, WIDTH, type PulseVideoProps } from "../shared/types";
import { PulseVideo, totalFrames } from "./PulseVideo";

const defaultProps: PulseVideoProps = {
  title: "Qoneqt Pulse",
  communityName: "Qoneqt",
  cta: "",
  global: { stylePrompt: "", palette: ["#a78bfa", "#7c3aed", "#f59e0b"], musicMood: "upbeat" },
  scenes: [],
  musicFile: null,
  logoFile: null,
  grainFile: null,
};

export const Root: React.FC = () => (
  <Composition
    id="PulseVideo"
    component={PulseVideo}
    width={WIDTH}
    height={HEIGHT}
    fps={FPS}
    durationInFrames={FPS}
    defaultProps={defaultProps}
    calculateMetadata={({ props }) => ({ durationInFrames: Math.max(FPS, totalFrames(props.scenes)) })}
  />
);
