import React from "react";
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from "remotion";
import { TransitionSeries, springTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { flip } from "@remotion/transitions/flip";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { FPS, type RenderScene } from "../../shared/types";
import { Outro } from "../Outro";
import type { Palette } from "../theme";
import type { Theme } from "../themes";
import { CreatorScene } from "./CreatorScene";

const T = 10; // transition length in frames
const OUTRO_FRAMES = Math.round(1.5 * FPS);
const sceneFrames = (s: RenderScene) => Math.max(1, Math.round(s.durationSec * FPS));

type Kind = "slide" | "wipe" | "flip" | "fade" | "cut";
const CYCLE: Kind[] = ["slide", "wipe", "cut", "flip", "slide", "fade"];
const DIRECTIONS = ["from-right", "from-left", "from-bottom", "from-top"] as const;

// The Director's choice, mapped to a real transition, never the same kind more than twice in a row.
export function pickTransitions(scenes: RenderScene[]): Kind[] {
  const kinds: Kind[] = [];
  scenes.forEach((s, i) => {
    if (i === 0) return kinds.push("cut");
    const wanted: Kind = s.transition === "slide" ? "slide" : s.transition === "fade" ? "fade" : s.transition === "zoom" ? "flip" : s.transition === "cut" ? "cut" : "wipe";
    let kind = wanted;
    let step = 0;
    while (kinds.length >= 2 && kinds[kinds.length - 1] === kind && kinds[kinds.length - 2] === kind) kind = CYCLE[(i + ++step) % CYCLE.length];
    kinds.push(kind);
  });
  return kinds;
}

import type { TransitionPresentation } from "@remotion/transitions";

// The presentations have different prop types; the series only needs a presentation.
const presentation = (kind: Kind, i: number): TransitionPresentation<Record<string, unknown>> => {
  const direction = DIRECTIONS[i % DIRECTIONS.length];
  const any = (p: unknown) => p as TransitionPresentation<Record<string, unknown>>;
  if (kind === "slide") return any(slide({ direction }));
  if (kind === "wipe") return any(wipe({ direction: direction === "from-top" ? "from-top-left" : direction }));
  if (kind === "flip") return any(flip({ direction: i % 2 ? "from-left" : "from-right" }));
  return any(fade());
};

// A short white flash on the twist: a "key hit".
const Flash: React.FC = () => {
  const f = useCurrentFrame();
  return <AbsoluteFill style={{ backgroundColor: "white", opacity: interpolate(f, [0, 4], [0.35, 0], { extrapolateRight: "clamp" }) }} />;
};

// Visual track for the creator edit. Every scene is extended by T frames when a transition follows,
// so the overlap is absorbed and each scene still starts exactly when its voice starts.
export const CreatorTimeline: React.FC<{ scenes: RenderScene[]; palette: Palette; theme: Theme; communityName: string; cta: string; logoFile: string | null }> = ({ scenes, palette, theme, communityName, cta, logoFile }) => {
  const kinds = pickTransitions(scenes);
  let cursor = 0;
  const twistStarts: number[] = [];
  scenes.forEach((s) => {
    if (s.purpose === "twist") twistStarts.push(cursor);
    cursor += sceneFrames(s);
  });

  return (
    <AbsoluteFill>
      <TransitionSeries>
        {scenes.map((scene, i) => {
          const nextHasTransition = i + 1 < scenes.length ? kinds[i + 1] !== "cut" : true; // the outro always fades in
          const frames = sceneFrames(scene) + (nextHasTransition ? T : 0);
          return (
            <React.Fragment key={scene.id}>
              {i > 0 && kinds[i] !== "cut" ? <TransitionSeries.Transition presentation={presentation(kinds[i], i)} timing={springTiming({ config: { damping: 200 }, durationInFrames: T })} /> : null}
              <TransitionSeries.Sequence durationInFrames={frames} name={`${scene.id} ${scene.layout} (${kinds[i]})`}>
                <CreatorScene scene={scene} index={i} palette={palette} theme={theme} frames={frames} />
              </TransitionSeries.Sequence>
            </React.Fragment>
          );
        })}
        <TransitionSeries.Transition presentation={fade()} timing={springTiming({ config: { damping: 200 }, durationInFrames: T })} />
        <TransitionSeries.Sequence durationInFrames={OUTRO_FRAMES} name="outro">
          <Outro communityName={communityName} cta={cta} logoFile={logoFile} palette={palette} theme={theme} />
        </TransitionSeries.Sequence>
      </TransitionSeries>
      {twistStarts.map((from) => (
        <Sequence key={from} from={from} durationInFrames={6} name="twist flash">
          <Flash />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
