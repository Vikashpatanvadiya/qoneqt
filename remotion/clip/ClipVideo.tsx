// A short vertical clip cut from a long video: the source reframed to 9:16 (follow the face,
// blurred fill or split screen), pauses removed, a hook title, and Style Pack captions on top.
import React from "react";
import { AbsoluteFill, OffthreadVideo, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { fitText } from "../../shared/layout";
import { CLIP_FPS, type ClipVideoProps, type CropKey, type KeepRange } from "../../shared/clip";
import type { RenderScene } from "../../shared/types";
import { AssetProvider, useAsset } from "../assets";
import { PackCaptions } from "../pack/PackCaptions";
import { resolvePack, type ResolvedPack } from "../pack/resolve";

const W = 1080;
const H = 1920;

// Crop centre (0..1 of the source width) at a time in the clip file, from the smoothed face track.
function cropAt(keys: CropKey[], t: number): number {
  if (keys.length === 0) return 0.5;
  if (t <= keys[0].t) return keys[0].x;
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i].t) return interpolate(t, [keys[i - 1].t, keys[i].t], [keys[i - 1].x, keys[i].x]);
  }
  return keys[keys.length - 1].x;
}

// The source scaled to cover a box, shifted so the crop centre sits in the middle of it.
const Framed: React.FC<{ file: string; boxW: number; boxH: number; srcW: number; srcH: number; cx: number; trimBefore: number; muted?: boolean }> = ({ file, boxW, boxH, srcW, srcH, cx, trimBefore, muted }) => {
  const asset = useAsset();
  const s = Math.max(boxH / srcH, boxW / srcW);
  const vw = srcW * s;
  const vh = srcH * s;
  const left = Math.min(0, Math.max(boxW - vw, boxW / 2 - cx * vw));
  return (
    <div style={{ position: "absolute", width: boxW, height: boxH, overflow: "hidden" }}>
      <OffthreadVideo src={asset(file)} trimBefore={trimBefore} muted={muted} style={{ position: "absolute", left, top: (boxH - vh) / 2, width: vw, height: vh }} />
    </div>
  );
};

// One kept range of the clip file, laid out for the chosen layout.
// `outFrom` is where this range starts in the output, so the split-screen background keeps playing across cuts.
const Segment: React.FC<{ props: ClipVideoProps; range: KeepRange; rp: ResolvedPack; outFrom: number }> = ({ props, range, rp, outFrom }) => {
  const frame = useCurrentFrame();
  const asset = useAsset();
  const t = range.from + frame / CLIP_FPS;
  const cx = cropAt(props.crop, t);
  const trimBefore = Math.round(range.from * CLIP_FPS);
  const { width: sw, height: sh } = props.source;

  if (props.layout === "blur") {
    const fgH = (W * sh) / sw;
    return (
      <AbsoluteFill style={{ background: "#000" }}>
        {props.backgroundFile ? (
          // Pre-blurred by the pipeline (ffmpeg), much faster than blurring every frame in the browser
          <OffthreadVideo src={asset(props.backgroundFile)} trimBefore={trimBefore} muted style={{ position: "absolute", width: W, height: H, objectFit: "cover" }} />
        ) : (
          <AbsoluteFill style={{ filter: "blur(36px) brightness(0.55) saturate(1.1)", transform: "scale(1.15)" }}>
            <Framed file={props.videoFile} boxW={W} boxH={H} srcW={sw} srcH={sh} cx={0.5} trimBefore={trimBefore} muted />
          </AbsoluteFill>
        )}
        <div style={{ position: "absolute", left: 0, top: H * 0.42 - fgH / 2, width: W, height: fgH, boxShadow: "0 30px 80px rgba(0,0,0,0.6)" }}>
          <OffthreadVideo src={asset(props.videoFile)} trimBefore={trimBefore} style={{ width: W, height: fgH }} />
        </div>
      </AbsoluteFill>
    );
  }

  if (props.layout === "split") {
    return (
      <AbsoluteFill style={{ background: rp.bg }}>
        <Framed file={props.videoFile} boxW={W} boxH={H / 2} srcW={sw} srcH={sh} cx={cx} trimBefore={trimBefore} />
        <div style={{ position: "absolute", top: H / 2, left: 0, width: W, height: H / 2, overflow: "hidden" }}>
          {props.backgroundFile ? (
            <OffthreadVideo src={asset(props.backgroundFile)} trimBefore={outFrom} muted style={{ width: W, height: H / 2, objectFit: "cover" }} />
          ) : (
            <MotionBackground rp={rp} />
          )}
        </div>
        <div style={{ position: "absolute", top: H / 2 - 3, left: 0, width: W, height: 6, background: rp.accent }} />
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <Framed file={props.videoFile} boxW={W} boxH={H} srcW={sw} srcH={sh} cx={cx} trimBefore={trimBefore} />
    </AbsoluteFill>
  );
};

// Bottom half of the split screen when no background video is available: the pack's colours in slow motion.
const MotionBackground: React.FC<{ rp: ResolvedPack }> = ({ rp }) => {
  const frame = useCurrentFrame();
  const t = frame / CLIP_FPS;
  const colors = [rp.accent, ...rp.spec.palette.accent.filter((c) => c !== rp.accent)];
  return (
    <AbsoluteFill style={{ background: rp.bg }}>
      {colors.slice(0, 3).map((c, i) => (
        <div key={i} style={{ position: "absolute", width: 700, height: 700, borderRadius: 999, background: c, opacity: 0.45, filter: "blur(80px)", left: 190 + Math.sin(t * (0.35 + i * 0.12) + i * 2) * 330, top: 130 + Math.cos(t * (0.28 + i * 0.1) + i) * 220 }} />
      ))}
    </AbsoluteFill>
  );
};

// The hook, big at the top for the first seconds, so the clip makes sense from frame 0.
const Hook: React.FC<{ text: string; rp: ResolvedPack; split: boolean }> = ({ text, rp, split }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 14, stiffness: 180 } });
  const out = interpolate(frame, [fps * 2.4, fps * 2.8], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const upper = rp.spec.fonts.headingCase === "upper";
  const fit = fitText(text, { maxWidth: W - 200, maxHeight: 300, fontSize: 76, minFontSize: 44, lineHeight: 1.08, uppercase: upper });
  return (
    <div style={{ position: "absolute", top: split ? H * 0.06 : H * 0.12, left: 70, right: 70, display: "flex", justifyContent: "center", opacity: out, transform: `scale(${0.85 + 0.15 * pop})` }}>
      <div style={{ background: rp.light ? rp.bg : "rgba(0,0,0,0.72)", color: rp.light ? rp.fg : "#fff", fontFamily: rp.heading, fontWeight: rp.spec.fonts.weightHeading, fontSize: fit.fontSize, lineHeight: 1.08, textTransform: upper ? "uppercase" : "none", textAlign: "center", padding: "18px 30px", borderRadius: 18, borderBottom: `8px solid ${rp.accent}` }}>{text}</div>
    </div>
  );
};

export const ClipVideo: React.FC<ClipVideoProps> = (props) => (
  <AssetProvider base={props.assetBase}>
    <ClipVideoInner {...props} />
  </AssetProvider>
);

const ClipVideoInner: React.FC<ClipVideoProps> = (props) => {
  const rp = resolvePack(props.packId, props.title) ?? resolvePack("creator_pop", props.title)!;
  let cursor = 0;
  const segments = props.keep.map((range) => {
    const frames = Math.max(1, Math.round((range.to - range.from) * CLIP_FPS));
    const from = cursor;
    cursor += frames;
    return { range, from, frames };
  });
  // Captions read a scene; the whole clip is one scene whose words are already in output time.
  const scene: RenderScene = { id: "clip", purpose: "point", narration: "", onScreenText: "", layout: "full_image", camera: "static", transition: "cut", captionStyle: "pop", emphasisWords: props.emphasisWords, imageFile: props.videoFile, audioFile: "", durationSec: cursor / CLIP_FPS, words: props.words };

  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {segments.map(({ range, from, frames }, i) => (
        <Sequence key={i} from={from} durationInFrames={frames} name={`keep ${range.from.toFixed(1)}-${range.to.toFixed(1)}s`}>
          <Segment props={props} range={range} rp={rp} outFrom={from} />
        </Sequence>
      ))}
      {props.captions ? <PackCaptions scene={scene} rp={rp} look={{ kind: "image", layout: "full" }} index={1} /> : null}
      {props.hook ? (
        <Sequence durationInFrames={Math.round(2.8 * CLIP_FPS)} name="hook">
          <Hook text={props.hook} rp={rp} split={props.layout === "split"} />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};
