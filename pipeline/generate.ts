// The pipeline: Researcher -> Scriptwriter -> Director -> assets -> Remotion render.
// Used by the local CLI (scripts/gen.ts) and by the GitHub Action (pipeline/run.ts).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import type { PulseVideoProps, RenderScene } from "../shared/types";
import { normalizeShotPlan, runDirector } from "./agents/director";
import { runResearcher } from "./agents/researcher";
import { runScriptwriter } from "./agents/scriptwriter";
import { config } from "./config";
import { fluxNeurons } from "./cost/pricing";
import { cloudflareImage } from "./providers/image";
import type { LlmResult } from "./providers/llm";
import { edgeTts } from "./providers/tts";
import { scriptWordCount, type CommunityProfile, type InputType, type Script } from "./schemas";
import { mapLimit } from "./util";

export type StageName = "ingest" | "research" | "script" | "script_critic" | "direct" | "assets" | "vision_critic" | "render" | "upload";

export type StageResult<T> = { value: T; summary: string; reason?: string; output?: unknown; retries?: number };

// Wraps a stage so the caller decides where progress goes (console, Supabase).
export type StageRunner = <T>(name: StageName, fn: () => Promise<StageResult<T>>) => Promise<T>;

export type GenerateInput = {
  inputType: InputType;
  content: string;
  community: CommunityProfile;
  workDir: string;
  stage: StageRunner;
};

export type GenerateResult = {
  title: string;
  script: Script;
  videoFile: string;
  thumbFile: string;
  durationSec: number;
  metrics: {
    llm_calls: number;
    llm_failures: number;
    input_tokens: number;
    output_tokens: number;
    images: number;
    images_cached: number;
    fallbacks: number;
    neurons_est: number;
  };
};

function imageSize(file: string): { width: number; height: number } {
  const out = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file]).toString();
  const [width, height] = out.trim().split(",").map(Number);
  return { width, height };
}

export async function generateVideo(input: GenerateInput): Promise<GenerateResult> {
  const { inputType, content, community, workDir, stage } = input;
  const publicDir = path.join(workDir, "public");
  fs.rmSync(publicDir, { recursive: true, force: true });
  fs.mkdirSync(publicDir, { recursive: true });
  const metrics: GenerateResult["metrics"] = { llm_calls: 0, llm_failures: 0, input_tokens: 0, output_tokens: 0, images: 0, images_cached: 0, fallbacks: 0, neurons_est: 0 };

  // Adds the call's tokens to the job metrics and returns what the stage row should store.
  const track = <T>(res: LlmResult<T>) => {
    metrics.llm_calls += res.usage.length;
    metrics.llm_failures += res.failures.length;
    for (const u of res.usage) {
      metrics.input_tokens += u.inputTokens;
      metrics.output_tokens += u.outputTokens;
    }
    return { usage: res.usage, failures: res.failures };
  };

  const research = await stage("research", async () => {
    const res = await runResearcher({ inputType, content, communityProfile: community });
    const chosen = res.data.angles[res.data.chosenIndex];
    return {
      value: res.data,
      summary: `Angle: ${chosen.title} (${chosen.targetEmotion})`,
      reason: res.data.reason,
      output: { research: res.data, ...track(res) },
      retries: res.failures.length,
    };
  });

  const script = await stage("script", async () => {
    const res = await runScriptwriter({ content, research, communityProfile: community });
    const wordCount = scriptWordCount(res.data);
    return {
      value: res.data,
      summary: `"${res.data.title}": ${res.data.scenes.length} scenes, ${wordCount} words. Hook: ${res.data.hook}`,
      reason: `Ends with the question: ${res.data.cta}`,
      output: { versions: [{ version: 1, script: res.data, wordCount }], ...track(res) },
      retries: res.failures.length,
    };
  });

  const plan = await stage("direct", async () => {
    const res = await runDirector({ script, communityProfile: community });
    const { plan, repairs } = normalizeShotPlan(res.data, script);
    const layouts = plan.shots.map((s) => s.layout);
    const count = (l: string) => layouts.filter((x) => x === l).length;
    return {
      value: plan,
      summary: `${count("full_image")} image scenes, ${layouts.length - count("full_image")} designed scenes, ${plan.global.musicMood} music`,
      reason: `Style: ${plan.global.stylePrompt}`,
      output: { plan, repairs, ...track(res) },
      retries: res.failures.length,
    };
  });

  const scenes = await stage("assets", async () => {
    const value = await mapLimit(script.scenes, config.maxParallelAssets, async (scene): Promise<RenderScene> => {
      const shot = plan.shots.find((s) => s.sceneId === scene.id)!;
      const wantsImage = shot.layout === "full_image";
      const [image, voice] = await Promise.all([
        wantsImage
          ? cloudflareImage.generate(`${shot.visualPrompt}. ${plan.global.stylePrompt}. Vertical composition, no text, no watermark.`).catch((err) => {
              console.warn(`  [image] ${scene.id} failed, using a designed scene: ${(err as Error).message.slice(0, 160)}`);
              return null;
            })
          : null,
        edgeTts.speak(scene.narration, community.defaultVoice),
      ]);

      let imageFile: string | null = null;
      if (image) {
        imageFile = `${scene.id}.jpg`;
        fs.copyFileSync(image.file, path.join(publicDir, imageFile));
        if (image.cached) {
          metrics.images_cached++;
        } else {
          const size = imageSize(image.file);
          metrics.images++;
          metrics.neurons_est += fluxNeurons(size.width, size.height, image.steps);
        }
      } else if (wantsImage) {
        metrics.fallbacks++;
      }
      const audioFile = `${scene.id}.mp3`;
      fs.copyFileSync(voice.audioFile, path.join(publicDir, audioFile));
      console.log(`  ${scene.id} ${wantsImage ? (image ? `image ${image.cached ? "cached" : `${(image.ms / 1000).toFixed(1)}s`}` : "image FAILED -> text card") : shot.layout}, voice ${voice.durationSec.toFixed(1)}s (${voice.timingSource})`);

      return {
        id: scene.id,
        narration: scene.narration,
        onScreenText: scene.onScreenText,
        // A scene whose image failed becomes a designed scene, so the video still finishes.
        layout: wantsImage && !image ? "text_card" : shot.layout,
        camera: shot.camera,
        transition: shot.transition,
        captionStyle: shot.captionStyle,
        emphasisWords: shot.emphasisWords,
        statValue: shot.statValue,
        imageFile,
        audioFile,
        durationSec: voice.durationSec + config.scenePaddingSec,
        words: voice.words,
      };
    });
    return {
      value,
      summary: `${metrics.images} new images, ${metrics.images_cached} cached, ${metrics.fallbacks} fallbacks, ${value.length} voice tracks`,
      output: { neurons_est: metrics.neurons_est, scenes: value.map((s) => ({ id: s.id, layout: s.layout, durationSec: s.durationSec })) },
    };
  });

  const durationSec = scenes.reduce((n, s) => n + s.durationSec, 0);
  const videoFile = path.join(workDir, "video.mp4");
  const thumbFile = path.join(workDir, "thumb.jpg");

  await stage("render", async () => {
    const inputProps: PulseVideoProps = { title: script.title, communityName: community.name, cta: script.cta, global: plan.global, scenes };
    fs.writeFileSync(path.join(workDir, "props.json"), JSON.stringify(inputProps, null, 2));
    const serveUrl = await bundle({ entryPoint: path.resolve("remotion/index.ts"), publicDir });
    const composition = await selectComposition({ serveUrl, id: "PulseVideo", inputProps });
    await renderMedia({ composition, serveUrl, codec: "h264", crf: config.render.crf(), outputLocation: videoFile, inputProps, concurrency: os.cpus().length });
    execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", "0.5", "-i", videoFile, "-frames:v", "1", "-vf", "scale=540:-2", "-q:v", "4", thumbFile]);
    const sizeMb = fs.statSync(videoFile).size / 1024 / 1024;
    return { value: null, summary: `${durationSec.toFixed(1)}s video, ${sizeMb.toFixed(1)} MB`, output: { sizeMb, durationSec, cpus: os.cpus().length } };
  });

  return { title: script.title, script, videoFile, thumbFile, durationSec, metrics };
}
