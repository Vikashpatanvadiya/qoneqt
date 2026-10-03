import React, { useMemo } from "react";
import { Audio, Sequence, interpolate, staticFile, useVideoConfig } from "remotion";
import type { PulseVideoProps, RenderScene } from "../shared/types";
import { pickTransitions } from "./creator/CreatorTimeline";
import { useAsset } from "./assets";

const DUCK = 0.2; // about -14 dB under the voice
const ATTACK = 4; // frames to duck before speech
const RELEASE = 10; // frames to come back after speech
const bare = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

type Cue = { sfx: string; at: number; gain: number };

// Music under the voice with smooth ducking, plus sound effects placed on transitions, emphasis words, the hook and the twist.
export const SoundTrack: React.FC<{ scenes: RenderScene[]; sound: NonNullable<PulseVideoProps["sound"]>; creator: boolean }> = ({ scenes, sound, creator }) => {
  const { fps, durationInFrames } = useVideoConfig();
  const asset = useAsset();

  const { speech, cues, voiceEnd } = useMemo(() => {
    const speech: Array<[number, number]> = [];
    const cues: Cue[] = [];
    const kinds = creator ? pickTransitions(scenes) : scenes.map((s, i) => (i === 0 || s.transition === "cut" ? "cut" : "fade"));
    let cursor = 0;
    scenes.forEach((scene, i) => {
      const start = cursor;
      const frames = Math.max(1, Math.round(scene.durationSec * fps));
      for (const w of scene.words) speech.push([start + Math.round(w.startSec * fps), start + Math.round(w.endSec * fps)]);
      if (i === 0) cues.push({ sfx: "hit", at: 0, gain: 0.9 });
      else if (kinds[i] !== "cut") cues.push({ sfx: "whoosh", at: Math.max(0, start - 5), gain: 1 });
      if (scene.purpose === "twist" && i > 0) {
        cues.push({ sfx: "riser", at: Math.max(0, start - 27), gain: 0.8 });
        cues.push({ sfx: "hit", at: start, gain: 0.8 });
      }
      if (scene.layout === "stat_card" && scene.statValue) cues.push({ sfx: "tick", at: start + 2, gain: 0.6 });
      // One pop per scene, on the first emphasis word.
      const emphasis = new Set(scene.emphasisWords.flatMap((w) => w.split(/\s+/)).map(bare).filter(Boolean));
      const hit = scene.words.find((w) => emphasis.has(bare(w.word)));
      if (hit) cues.push({ sfx: "pop", at: start + Math.round(hit.startSec * fps), gain: 0.7 });
      cursor += frames;
    });
    // Merge words closer than a quarter second into one speaking span.
    const merged: Array<[number, number]> = [];
    for (const [a, b] of speech.sort((x, y) => x[0] - y[0])) {
      const last = merged[merged.length - 1];
      if (last && a - last[1] < fps / 4) last[1] = Math.max(last[1], b);
      else merged.push([a, b]);
    }
    return { speech: merged, cues, voiceEnd: cursor };
  }, [scenes, fps, creator]);

  const musicGain = (f: number) => {
    // Fade out over the last second, and lift a little on the outro where nobody speaks.
    const tail = interpolate(f, [durationInFrames - fps, durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    const outroLift = interpolate(f, [voiceEnd, voiceEnd + 8], [1, 1.35], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    if (!sound.duck) return sound.musicVolume * tail * outroLift;
    let duck = 1;
    for (const [a, b] of speech) {
      if (f < a - ATTACK) break;
      if (f >= a && f <= b) {
        duck = DUCK;
        break;
      }
      if (f >= a - ATTACK && f < a) duck = Math.min(duck, interpolate(f, [a - ATTACK, a], [1, DUCK]));
      if (f > b && f <= b + RELEASE) duck = Math.min(duck, interpolate(f, [b, b + RELEASE], [DUCK, 1]));
    }
    return sound.musicVolume * duck * tail * outroLift;
  };

  return (
    <>
      {sound.bedFile ? <Audio src={asset(sound.bedFile)} volume={musicGain} /> : null}
      {sound.sfx && sound.sfxVolume > 0
        ? cues
            .filter((c) => sound.sfx![c.sfx])
            .map((c, i) => (
              <Sequence key={`${c.sfx}-${i}`} from={c.at} durationInFrames={Math.round(fps * 1.2)} name={`sfx ${c.sfx}`}>
                <Audio src={asset(sound.sfx![c.sfx])} volume={sound.sfxVolume * c.gain} />
              </Sequence>
            ))
        : null}
    </>
  );
};
