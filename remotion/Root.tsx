import React from "react";
import { Composition } from "remotion";
import { FPS, HEIGHT, WIDTH, type PulseVideoProps } from "../shared/types";
import { PulseVideo, totalFrames } from "./PulseVideo";
import { ClipVideo } from "./clip/ClipVideo";
import { CLIP_FPS, clipFrames, type ClipVideoProps } from "../shared/clip";

const clipDefaults: ClipVideoProps = { title: "", hook: "", videoFile: "", backgroundFile: null, source: { width: 1920, height: 1080 }, layout: "face", crop: [], keep: [{ from: 0, to: 1 }], words: [], emphasisWords: [], captions: true, packId: "creator_pop" };

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
  <>
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
  <Composition
    id="ClipVideo"
    component={ClipVideo}
    width={WIDTH}
    height={HEIGHT}
    fps={CLIP_FPS}
    durationInFrames={CLIP_FPS}
    defaultProps={clipDefaults}
    calculateMetadata={({ props }) => ({ durationInFrames: clipFrames(props.keep) })}
  />
  </>
);
