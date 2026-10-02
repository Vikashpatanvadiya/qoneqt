import React from "react";
import { Composition } from "remotion";
import { FPS, HEIGHT, WIDTH, type PulseVideoProps } from "../shared/types";
import { PulseVideo, sceneFrames } from "./PulseVideo";

const defaultProps: PulseVideoProps = { title: "Qoneqt Pulse", scenes: [] };

export const Root: React.FC = () => (
  <Composition
    id="PulseVideo"
    component={PulseVideo}
    width={WIDTH}
    height={HEIGHT}
    fps={FPS}
    durationInFrames={FPS}
    defaultProps={defaultProps}
    calculateMetadata={({ props }) => ({
      durationInFrames: Math.max(
        FPS,
        props.scenes.reduce((n, s) => n + sceneFrames(s), 0),
      ),
    })}
  />
);
