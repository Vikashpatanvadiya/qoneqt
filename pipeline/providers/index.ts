// Engine registry. An engine is a full set of providers. The pipeline only talks to these interfaces,
// so the LLM can be swapped per job (options.engine) or per deployment (PULSE_ENGINE).
import { config } from "../config";
import { cloudflareImage, type ImageProvider } from "./image";
import { geminiLlm, geminiVision, type LlmProvider, type VisionProvider } from "./llm";
import { edgeTts, type TtsProvider } from "./tts";

export type Engine = {
  name: string;
  label: string;
  llm: LlmProvider;
  vision: VisionProvider;
  image: ImageProvider;
  tts: TtsProvider;
};

const engines: Record<string, Engine> = {
  gemini: { name: "gemini", label: "Cloud Gemini", llm: geminiLlm, vision: geminiVision, image: cloudflareImage, tts: edgeTts },
};

export const engineNames = () => Object.keys(engines);

// An unknown engine falls back to the default so the video still finishes. The note is shown in the job.
export function resolveEngine(requested?: string): { engine: Engine; note?: string } {
  const fallback = engines[config.engine()] ?? engines.gemini;
  if (!requested || requested === fallback.name) return { engine: fallback };
  const engine = engines[requested];
  return engine ? { engine } : { engine: fallback, note: `Engine "${requested}" is not available, used ${fallback.label} instead` };
}
