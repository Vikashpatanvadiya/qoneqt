// Shared between the pipeline, the Remotion composition and the UI.
// Agent types come straight from the zod schemas so they never drift.
import type { Shot, ShotPlan } from "../pipeline/schemas";

export type { CommunityProfile, InputType, Research, Script, Shot, ShotPlan } from "../pipeline/schemas";

export type WordTiming = {
  word: string;
  startSec: number;
  endSec: number;
};

export type RenderScene = {
  id: string;
  narration: string;
  onScreenText: string;
  layout: Shot["layout"];
  camera: Shot["camera"];
  transition: Shot["transition"];
  captionStyle: Shot["captionStyle"];
  emphasisWords: string[];
  statValue?: string;
  imageFile: string | null; // file name inside the Remotion public dir, null for designed layouts
  audioFile: string; // file name inside the Remotion public dir
  durationSec: number; // real TTS length + padding
  words: WordTiming[];
};

export type PulseVideoProps = {
  title: string;
  communityName: string;
  cta: string;
  global: ShotPlan["global"];
  scenes: RenderScene[];
};

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;
