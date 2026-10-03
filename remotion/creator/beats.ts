// Splits a scene into 2 or 3 "beats" so the picture changes every 1.5 to 3 seconds, like an edited Short.
// Cuts land on word starts, and preferably on emphasis words.
import type { RenderScene, WordTiming } from "../../shared/types";

export type Beat = {
  from: number; // frame inside the scene
  duration: number;
  kind: "image" | "word" | "card" | "card_alt";
  framing: number; // index into FRAMINGS
  word?: string;
};

const bare = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

export function planBeats(scene: RenderScene, sceneIndex: number, fps: number): Beat[] {
  const frames = Math.max(1, Math.round(scene.durationSec * fps));
  const isImage = scene.layout === "full_image" && Boolean(scene.imageFile);
  const durationSec = scene.durationSec;
  const single = (): Beat[] => [{ from: 0, duration: frames, kind: isImage ? "image" : "card", framing: sceneIndex % 4 }];
  if (durationSec < 3.2 || scene.words.length < 4) return single();

  const count = durationSec > 6 ? 3 : 2;
  const emphasis = new Set(scene.emphasisWords.flatMap((w) => w.split(/\s+/)).map(bare).filter(Boolean));
  const cuts: Array<{ sec: number; word: WordTiming }> = [];
  for (let k = 1; k < count; k++) {
    const target = (durationSec * k) / count;
    // Candidate cut points: word starts at least 1.2 s from the scene edges and from the previous cut.
    const candidates = scene.words.filter((w) => w.startSec > 1.2 && w.startSec < durationSec - 1.2 && (cuts.length === 0 || w.startSec - cuts[cuts.length - 1].sec > 1.2));
    if (candidates.length === 0) break;
    // Prefer an emphasis word near the target, otherwise the closest word start.
    const near = candidates.filter((w) => Math.abs(w.startSec - target) < 0.7 && emphasis.has(bare(w.word)));
    const pick = (near.length ? near : candidates).reduce((a, b) => (Math.abs(b.startSec - target) < Math.abs(a.startSec - target) ? b : a));
    cuts.push({ sec: pick.startSec, word: pick });
  }
  if (cuts.length === 0) return single();

  const starts = [0, ...cuts.map((c) => Math.round(c.sec * fps))];
  return starts.map((from, i) => {
    const end = i + 1 < starts.length ? starts[i + 1] : frames;
    const cutWord = i > 0 ? cuts[i - 1].word : undefined;
    let kind: Beat["kind"] = isImage ? "image" : i % 2 === 1 ? "card_alt" : "card";
    // In a 3-beat image scene, the middle beat becomes a big word card when it starts on an emphasis word.
    if (isImage && count === 3 && i === 1 && cutWord && emphasis.has(bare(cutWord.word))) kind = "word";
    return { from, duration: end - from, kind, framing: (i % 2 === 0 ? [0, 2] : [1, 3])[(sceneIndex + i) % 2], word: kind === "word" ? cutWord!.word.replace(/[^\p{L}\p{N}%₹$'-]/gu, "") : undefined };
  });
}

// Start and end framing of the image for one beat: scale, x and y offset (%). Scale changes 3 to 8 percent.
export const FRAMINGS = [
  { s0: 1.04, s1: 1.1, x0: 0, x1: -1.5, y0: 0, y1: -1.5 }, // wide, slow push in
  { s0: 1.36, s1: 1.29, x0: 3, x1: 0, y0: 7, y1: 5 }, // tight on the upper middle, easing out
  { s0: 1.15, s1: 1.21, x0: -6, x1: -1, y0: 1, y1: 0 }, // medium, drifting right
  { s0: 1.3, s1: 1.24, x0: 5, x1: 1, y0: -5, y1: -3 }, // tight low, drifting left
];
