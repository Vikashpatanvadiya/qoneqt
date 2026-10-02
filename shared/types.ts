// Shared between the pipeline and the Remotion composition.
// Keep in sync with the zod schemas in /pipeline/schemas.

export type WordTiming = {
  word: string;
  startSec: number;
  endSec: number;
};

export type RenderScene = {
  id: string;
  narration: string;
  onScreenText: string;
  imageFile: string | null; // file name inside the Remotion public dir, null = gradient fallback
  audioFile: string; // file name inside the Remotion public dir
  durationSec: number; // real TTS length + padding
  words: WordTiming[];
};

export type PulseVideoProps = {
  title: string;
  scenes: RenderScene[];
};

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;
