// Renders single frames of the real composition (captions and all) for the Vision Critic.
import path from "node:path";
import { renderStill, selectComposition } from "@remotion/renderer";
import { FPS, type PulseVideoProps } from "../shared/types";

// Frame index at 55% of each scene, the same point a viewer would see mid-sentence.
export function sceneMidFrames(props: PulseVideoProps): Map<string, number> {
  const frames = new Map<string, number>();
  let cursor = 0;
  for (const scene of props.scenes) {
    const length = Math.max(1, Math.round(scene.durationSec * FPS));
    frames.set(scene.id, cursor + Math.floor(length * 0.55));
    cursor += length;
  }
  return frames;
}

export async function renderSceneStills(input: { serveUrl: string; props: PulseVideoProps; sceneIds: string[]; outDir: string; suffix: string }): Promise<Map<string, string>> {
  const { serveUrl, props, sceneIds, outDir, suffix } = input;
  const composition = await selectComposition({ serveUrl, id: "PulseVideo", inputProps: props });
  const mid = sceneMidFrames(props);
  const files = new Map<string, string>();
  for (const id of sceneIds) {
    const output = path.join(outDir, `${id}_${suffix}.jpg`);
    // Half size is plenty for the critic and keeps the request small.
    await renderStill({ composition, serveUrl, inputProps: props, frame: mid.get(id)!, output, imageFormat: "jpeg", jpegQuality: 85, scale: 0.5 });
    files.set(id, output);
  }
  return files;
}
