// Shared between the pipeline, the Remotion composition and the UI.
// Agent types come straight from the zod schemas so they never drift.
import type { Shot, ShotPlan } from "../pipeline/schemas";

export type { CommunityProfile, Critique, InputType, Research, Script, ScriptVersion, Shot, ShotPlan } from "../pipeline/schemas";

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
  durationSec: number; // spoken length + padding
  words: WordTiming[];
  // Set by the code QA gate when the default layout would not be readable.
  titleFontSize?: number;
  captionFontSize?: number;
  highContrast?: boolean;
};

export type PulseVideoProps = {
  title: string;
  communityName: string;
  cta: string;
  global: ShotPlan["global"];
  scenes: RenderScene[];
  // Files inside the Remotion public dir. Each one is optional: the video still renders without it.
  musicFile: string | null;
  logoFile: string | null;
  grainFile: string | null;
};

export const FPS = 30;
export const OUTRO_SEC = 1.5;
export const TRANSITION_FRAMES = 9;
export const WIDTH = 1080;
export const HEIGHT = 1920;
