import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { FPS, OUTRO_SEC, TRANSITION_FRAMES, type PulseVideoProps, type RenderScene } from "../shared/types";
import { Captions } from "./Captions";
import { Outro } from "./Outro";
import { FilmLook, ProgressBar } from "./Overlays";
import { CardScene } from "./scenes/CardScene";
import { ImageScene } from "./scenes/ImageScene";
import { toPalette, type Palette } from "./theme";
import { themeFor, type Theme } from "./themes";
import { CreatorTimeline } from "./creator/CreatorTimeline";
import { SoundTrack } from "./SoundTrack";
import { AssetProvider, useAsset } from "./assets";
import { PackVideo } from "./pack/PackVideo";
import { resolvePack } from "./pack/resolve";

export const sceneFrames = (scene: RenderScene) => Math.max(1, Math.round(scene.durationSec * FPS));
export const OUTRO_FRAMES = Math.round(OUTRO_SEC * FPS);
export const totalFrames = (scenes: RenderScene[]) => scenes.reduce((n, s) => n + sceneFrames(s), 0) + OUTRO_FRAMES;

const MUSIC_VOLUME = 0.1;
const OUTRO_MUSIC_VOLUME = 0.3;
const FADE_FRAMES = Math.round(0.2 * FPS);

// The entering scene animates in on top of the previous one, which stays underneath until the move is done.
const Entrance: React.FC<{ transition: RenderScene["transition"]; children: React.ReactNode }> = ({ transition, children }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [0, TRANSITION_FRAMES], [0, 1], { extrapolateRight: "clamp" });
  const eased = 1 - (1 - p) ** 3;
  const style: React.CSSProperties =
    transition === "fade"
      ? { opacity: p }
      : transition === "slide"
        ? { transform: `translateX(${(1 - eased) * 100}%)` }
        : transition === "zoom"
          ? { opacity: Math.min(1, p * 1.6), transform: `scale(${1.35 - 0.35 * eased})` }
          : {};
  return <AbsoluteFill style={style}>{children}</AbsoluteFill>;
};

const SceneVisual: React.FC<{ scene: RenderScene; palette: Palette; isHook: boolean; frames: number; theme: Theme }> = ({ scene, palette, isHook, frames, theme }) =>
  scene.layout === "full_image" && scene.imageFile ? <ImageScene scene={scene} isHook={isHook} frames={frames} theme={theme} palette={palette} /> : <CardScene scene={scene} palette={palette} isHook={isHook} frames={frames} theme={theme} />;

const Music: React.FC<{ file: string; voiceFrames: number }> = ({ file, voiceFrames }) => {
  const { durationInFrames } = useVideoConfig();
  const asset = useAsset();
  return (
    <Audio
      src={asset(file)}
      loop
      volume={(f) => {
        // Low under the voice, a little louder on the outro, with a short fade at both ends.
        const level = interpolate(f, [voiceFrames - 6, voiceFrames + 6], [MUSIC_VOLUME, OUTRO_MUSIC_VOLUME], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const fade = interpolate(f, [0, FADE_FRAMES, durationInFrames - FADE_FRAMES, durationInFrames], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        return level * fade;
      }}
    />
  );
};

const VoiceAudio: React.FC<{ file: string }> = ({ file }) => {
  const asset = useAsset();
  return <Audio src={asset(file)} />;
};

export const PulseVideo: React.FC<PulseVideoProps> = (props) => {
  // Videos with a Style Pack use the pack renderer. Older videos (theme only) render exactly as before.
  const rp = resolvePack(props.global?.packId, props.title);
  return <AssetProvider base={props.assetBase}>{rp ? <PackVideo props={props} rp={rp} /> : <PulseVideoInner {...props} />}</AssetProvider>;
};

const PulseVideoInner: React.FC<PulseVideoProps> = ({ title, scenes, global, communityName, cta, musicFile, logoFile, grainFile, editStyle, sound }) => {
  const creator = editStyle !== "classic";
  const theme = themeFor(global?.theme, title);
  const directed = toPalette(global?.palette ?? []);
  const palette = theme.palette ? theme.palette(directed) : directed;
  const starts: number[] = [];
  let cursor = 0;
  for (const scene of scenes) {
    starts.push(cursor);
    cursor += sceneFrames(scene);
  }
  const voiceFrames = cursor;

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {creator ? (
        <CreatorTimeline scenes={scenes} palette={palette} theme={theme} communityName={communityName} cta={cta} logoFile={logoFile} />
      ) : (
        <>
      {/* Visuals. Each scene stays a few frames longer so the next one can transition in over it. */}
      {scenes.map((scene, i) => {
        const frames = sceneFrames(scene);
        return (
          <Sequence key={scene.id} from={starts[i]} durationInFrames={frames + TRANSITION_FRAMES} name={`${scene.id} ${scene.layout}`}>
            <Entrance transition={i === 0 ? "cut" : scene.transition}>
              <SceneVisual scene={scene} palette={palette} isHook={i === 0} frames={frames + TRANSITION_FRAMES} theme={theme} />
            </Entrance>
          </Sequence>
        );
      })}

      <Sequence from={voiceFrames} durationInFrames={OUTRO_FRAMES} name="outro">
        <Entrance transition="fade">
          <Outro communityName={communityName} cta={cta} logoFile={logoFile} palette={palette} theme={theme} />
        </Entrance>
      </Sequence>

        </>
      )}

      <FilmLook grainFile={grainFile} />

      {/* Captions and voice follow the exact scene timing, with no overlap */}
      {scenes.map((scene, i) => (
        <Sequence key={scene.id} from={starts[i]} durationInFrames={sceneFrames(scene)} name={`${scene.id} voice + captions`}>
          <Captions scene={scene} accent={palette.accent} theme={theme} creator={creator} />
          <VoiceAudio file={scene.audioFile} />
        </Sequence>
      ))}

      {sound ? <SoundTrack scenes={scenes} sound={sound} creator={creator} /> : null}
      {musicFile && !sound?.bedFile ? <Music file={musicFile} voiceFrames={voiceFrames} /> : null}
      <ProgressBar color={palette.accent} />
    </AbsoluteFill>
  );
};
