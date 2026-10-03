import React from "react";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { RenderScene } from "../../shared/types";
import { CardScene } from "../scenes/CardScene";
import { ImageScene } from "../scenes/ImageScene";
import type { Palette } from "../theme";
import type { Theme } from "../themes";
import { FRAMINGS, planBeats, type Beat } from "./beats";

const EASE = Easing.bezier(0.33, 0, 0.2, 1);
const bare = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

// Handheld feel: two slow sine waves per axis and a tiny rotation. Deterministic, so every render is the same.
function handheld(frame: number, fps: number, seed: number) {
  const t = frame / fps + seed;
  return {
    x: Math.sin(t * 1.7) * 5 + Math.sin(t * 3.1 + 1) * 2.5,
    y: Math.cos(t * 1.3) * 4 + Math.sin(t * 2.6 + 2) * 2,
    r: Math.sin(t * 0.9) * 0.35,
  };
}

// Quick punch-in on emphasis words: up fast with ease-out, then settle back.
function punch(frame: number, fps: number, scene: RenderScene, beat: Beat): number {
  const emphasis = new Set(scene.emphasisWords.flatMap((w) => w.split(/\s+/)).map(bare).filter(Boolean));
  const hit = scene.words.find((w) => emphasis.has(bare(w.word)) && w.startSec * fps >= beat.from && w.startSec * fps < beat.from + beat.duration);
  if (!hit) return 0;
  const e = frame - Math.round(hit.startSec * fps);
  return interpolate(e, [0, 4, 22], [0, 1, 0.25], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) }) * (e >= 0 ? 1 : 0);
}

const WordCard: React.FC<{ word: string; theme: Theme; palette: Palette; local: number }> = ({ word, theme, palette, local }) => {
  const { fps } = useVideoConfig();
  const pop = spring({ frame: local, fps, config: { damping: 11, stiffness: 220 } });
  const size = Math.min(260, Math.floor(1700 / Math.max(3, word.length)));
  return (
    <AbsoluteFill style={{ background: theme.cardBackground(palette, local / 60), alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          fontFamily: theme.titleFont,
          fontWeight: theme.titleWeight,
          fontSize: size,
          lineHeight: 1,
          textTransform: theme.upper ? "uppercase" : "none",
          color: theme.cardLight ? theme.cardText : palette.accent,
          textShadow: theme.titleGlow ? theme.titleGlow(palette) : "none",
          transform: `scale(${0.6 + 0.4 * pop}) rotate(${(1 - pop) * -4}deg)`,
          marginTop: "-18%",
        }}
      >
        {word}
      </div>
    </AbsoluteFill>
  );
};

export const CreatorScene: React.FC<{ scene: RenderScene; index: number; palette: Palette; theme: Theme; frames: number }> = ({ scene, index, palette, theme, frames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const beats = planBeats(scene, index, fps);
  const beatIndex = Math.max(0, beats.findIndex((b) => frame >= b.from && frame < b.from + b.duration));
  // Frames past the last beat (the transition overlap) stay on the last beat.
  const beat = frame >= beats[beats.length - 1].from ? beats[beats.length - 1] : beats[beatIndex];
  const local = frame - beat.from;
  const isHook = index === 0;

  if (beat.kind === "word" && beat.word) return <WordCard word={beat.word} theme={theme} palette={palette} local={local} />;

  if (beat.kind === "image") {
    const f = FRAMINGS[beat.framing];
    const p = EASE(Math.min(1, Math.max(0, local / Math.max(1, beat.duration))));
    const hand = handheld(frame, fps, index * 1.7);
    const scale = (f.s0 + (f.s1 - f.s0) * p) * (1 + 0.08 * punch(frame, fps, scene, beat));
    const transform = `translate(${f.x0 + (f.x1 - f.x0) * p}%, ${f.y0 + (f.y1 - f.y0) * p}%) translate(${hand.x}px, ${hand.y}px) rotate(${hand.r}deg) scale(${scale})`;
    // Only the first beat animates the title in; later beats are hard cuts with the title already in place.
    return <ImageScene scene={scene} isHook={isHook} frames={frames} theme={theme} palette={palette} imageTransform={transform} titleAlreadyIn={beat.from > 0} />;
  }

  // Designed cards: the alternate beat re-frames the same card with a punch zoom.
  const zoom = beat.kind === "card_alt" ? 1.06 + 0.06 * spring({ frame: local, fps, config: { damping: 14, stiffness: 200 } }) : 1 + 0.05 * punch(frame, fps, scene, beat);
  const hand = handheld(frame, fps, index * 2.3);
  return (
    <AbsoluteFill style={{ transform: `translate(${hand.x * 0.5}px, ${hand.y * 0.5}px) scale(${zoom})` }}>
      <CardScene scene={scene} palette={palette} isHook={isHook} frames={frames} theme={theme} instant={beat.kind === "card_alt"} />
    </AbsoluteFill>
  );
};
