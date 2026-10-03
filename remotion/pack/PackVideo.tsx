// The whole video for a Style Pack: beats, camera feel, transitions, captions, sound and outro all come from the pack.
import React from "react";
import { AbsoluteFill, Audio, Easing, Sequence, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { TransitionSeries, springTiming, type TransitionPresentation } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { flip } from "@remotion/transitions/flip";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { FPS, type PulseVideoProps, type RenderScene } from "../../shared/types";
import type { TransitionKind } from "../../src/styles/packs/types";
import { useAsset } from "../assets";
import { planBeats } from "../creator/beats";
import { ProgressBar } from "../Overlays";
import { SoundTrack } from "../SoundTrack";
import { PackCaptions } from "./PackCaptions";
import { PackCard, PackFilm, PackImage, PackOutro } from "./PackScenes";
import { packTransitions, sceneLook, type ResolvedPack } from "./resolve";

const T = 10;
const OUTRO_FRAMES = Math.round(1.5 * FPS);
const sceneFrames = (s: RenderScene) => Math.max(1, Math.round(s.durationSec * FPS));
const bare = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const DIRECTIONS = ["from-right", "from-left", "from-bottom", "from-top"] as const;

const presentation = (kind: TransitionKind, i: number): TransitionPresentation<Record<string, unknown>> => {
  const direction = DIRECTIONS[i % DIRECTIONS.length];
  const any = (p: unknown) => p as TransitionPresentation<Record<string, unknown>>;
  if (kind === "slide") return any(slide({ direction }));
  if (kind === "wipe") return any(wipe({ direction: direction === "from-top" ? "from-top-left" : direction }));
  if (kind === "flip") return any(flip({ direction: i % 2 ? "from-left" : "from-right" }));
  return any(fade());
};

// Camera feel: handheld shake, a slow float, or locked off.
function cameraDrift(camera: ResolvedPack["spec"]["motion"]["camera"], frame: number, fps: number, seed: number) {
  const t = frame / fps + seed;
  if (camera === "handheld") return { x: Math.sin(t * 1.7) * 5 + Math.sin(t * 3.1 + 1) * 2.5, y: Math.cos(t * 1.3) * 4 + Math.sin(t * 2.6 + 2) * 2, r: Math.sin(t * 0.9) * 0.35 };
  if (camera === "float") return { x: Math.sin(t * 0.5) * 7, y: Math.cos(t * 0.4) * 9, r: 0 };
  return { x: 0, y: 0, r: 0 };
}

const PackScene: React.FC<{ scene: RenderScene; index: number; total: number; rp: ResolvedPack; frames: number }> = ({ scene, index, total, rp, frames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const m = rp.spec.motion;
  const look = sceneLook(scene, index, total, rp.spec);
  const beats = planBeats(scene, index, fps, { shot: m.shotLengthRange, wordBeats: m.punchIn });
  const beat = frame >= beats[beats.length - 1].from ? beats[beats.length - 1] : beats[Math.max(0, beats.findIndex((b) => frame >= b.from && frame < b.from + b.duration))];
  const local = frame - beat.from;
  const ease = m.easing === "snappy" ? Easing.bezier(0.2, 0.9, 0.1, 1) : Easing.bezier(0.33, 0, 0.2, 1);
  const p = ease(Math.min(1, Math.max(0, local / Math.max(1, beat.duration))));
  const drift = cameraDrift(m.camera, frame, fps, index * 1.7);

  // Punch-in on the first emphasis word of this beat.
  let punch = 0;
  if (m.punchIn) {
    const emphasis = new Set(scene.emphasisWords.flatMap((w) => w.split(/\s+/)).map(bare).filter(Boolean));
    const hit = scene.words.find((w) => emphasis.has(bare(w.word)) && w.startSec * fps >= beat.from && w.startSec * fps < beat.from + beat.duration);
    if (hit) {
      const e = frame - Math.round(hit.startSec * fps);
      punch = e >= 0 ? interpolate(e, [0, 4, 22], [0, 1, 0.25], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) }) : 0;
    }
  }

  if (look.kind === "image") {
    const [z0, z1] = m.zoomRange;
    const odd = beats.indexOf(beat) % 2 === 1;
    const scale = (odd ? z1 + 0.12 - 0.05 * p : z0 + (z1 - z0) * p) * (1 + 0.08 * punch);
    const shift = odd ? `translate(${2 - 2 * p}%, ${5 - 1 * p}%)` : `translate(${-1 * p}%, ${-1 * p}%)`;
    const transform = `${shift} translate(${drift.x}px, ${drift.y}px) rotate(${drift.r}deg) scale(${scale})`;
    return <PackImage scene={scene} rp={rp} look={look} index={index} frames={frames} transform={transform} titleAlreadyIn={beat.from > 0} />;
  }
  const zoom = beat.kind === "card_alt" ? 1.04 + 0.04 * p : 1 + 0.05 * punch;
  return (
    <AbsoluteFill style={{ transform: `translate(${drift.x * 0.5}px, ${drift.y * 0.5}px) scale(${zoom})` }}>
      <PackCard scene={scene} rp={rp} look={look} index={index} frames={frames} instant={beat.kind === "card_alt"} />
    </AbsoluteFill>
  );
};

const Flash: React.FC<{ color: string }> = ({ color }) => {
  const f = useCurrentFrame();
  return <AbsoluteFill style={{ backgroundColor: color, opacity: interpolate(f, [0, 4], [0.35, 0], { extrapolateRight: "clamp" }) }} />;
};

const VoiceAudio: React.FC<{ file: string }> = ({ file }) => {
  const asset = useAsset();
  return <Audio src={asset(file)} />;
};

const Music: React.FC<{ file: string }> = ({ file }) => {
  const asset = useAsset();
  return <Audio src={asset(file)} loop volume={0.1} />;
};

export const PackVideo: React.FC<{ props: PulseVideoProps; rp: ResolvedPack }> = ({ props, rp }) => {
  const { scenes, communityName, cta, logoFile, grainFile, sound, musicFile } = props;
  const kinds = packTransitions(scenes.length, rp.spec.motion.transitionSet);
  const starts: number[] = [];
  const twists: number[] = [];
  let cursor = 0;
  scenes.forEach((s) => {
    starts.push(cursor);
    if (s.purpose === "twist") twists.push(cursor);
    cursor += sceneFrames(s);
  });

  return (
    <AbsoluteFill style={{ backgroundColor: rp.bg }}>
      <TransitionSeries>
        {scenes.map((scene, i) => {
          const nextHasTransition = i + 1 < scenes.length ? kinds[i + 1] !== "cut" : true;
          const frames = sceneFrames(scene) + (nextHasTransition ? T : 0);
          return (
            <React.Fragment key={scene.id}>
              {i > 0 && kinds[i] !== "cut" ? <TransitionSeries.Transition presentation={presentation(kinds[i], i)} timing={springTiming({ config: { damping: 200 }, durationInFrames: T })} /> : null}
              <TransitionSeries.Sequence durationInFrames={frames} name={`${scene.id} ${scene.layout} (${kinds[i]})`}>
                <PackScene scene={scene} index={i} total={scenes.length} rp={rp} frames={frames} />
              </TransitionSeries.Sequence>
            </React.Fragment>
          );
        })}
        <TransitionSeries.Transition presentation={fade()} timing={springTiming({ config: { damping: 200 }, durationInFrames: T })} />
        <TransitionSeries.Sequence durationInFrames={OUTRO_FRAMES} name="outro">
          <PackOutro rp={rp} communityName={communityName} cta={cta} logoFile={logoFile} />
        </TransitionSeries.Sequence>
      </TransitionSeries>

      {rp.spec.motion.punchIn
        ? twists.map((from) => (
            <Sequence key={from} from={from} durationInFrames={6} name="twist flash">
              <Flash color={rp.light ? "#000000" : "#ffffff"} />
            </Sequence>
          ))
        : null}

      <PackFilm rp={rp} grainFile={grainFile} />

      {scenes.map((scene, i) => (
        <Sequence key={scene.id} from={starts[i]} durationInFrames={sceneFrames(scene)} name={`${scene.id} voice + captions`}>
          <PackCaptions scene={scene} rp={rp} look={sceneLook(scene, i, scenes.length, rp.spec)} index={i} />
          <VoiceAudio file={scene.audioFile} />
        </Sequence>
      ))}

      {sound ? <SoundTrack scenes={scenes} sound={sound} creator transitions={kinds} profile={rp.spec.sfxProfile} /> : null}
      {musicFile && !sound?.bedFile ? <Music file={musicFile} /> : null}
      <ProgressBar color={rp.accent} />
    </AbsoluteFill>
  );
};
