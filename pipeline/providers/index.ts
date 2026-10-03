// Engine registry. An engine is a full set of providers. The pipeline only talks to these interfaces,
// so the LLM can be swapped per job (options.engine) or per deployment (PULSE_ENGINE).
import { config } from "../config";
import { defaultImages, type ImageProvider } from "./image";
import type { Combined, CombinedInput } from "../agents/combined";
import { geminiLlm, geminiVision, type LlmProvider, type LlmResult, type VisionProvider } from "./llm";
import { runPulsePlanner } from "./pulseLm";
import { edgeTts, type TtsProvider } from "./tts";

export type Engine = {
  name: string;
  label: string;
  llm: LlmProvider;
  vision: VisionProvider;
  image: ImageProvider;
  tts: TtsProvider;
  // Set when one model plans the script and the shots in a single call (Pulse-LM).
  planner?: (input: CombinedInput) => Promise<LlmResult<Combined> & { tokensPerSec: number }>;
};

const engines: Record<string, Engine> = {
  gemini: { name: "gemini", label: "Cloud Gemini", llm: geminiLlm, vision: geminiVision, image: defaultImages, tts: edgeTts },
  // Our fine-tuned planner writes the script and shot plan. Gemini still acts as the critics, which need a different or multimodal model.
  "pulse-lm": { name: "pulse-lm", label: "Pulse-LM", llm: geminiLlm, vision: geminiVision, image: defaultImages, tts: edgeTts, planner: runPulsePlanner },
};

export const engineNames = () => Object.keys(engines);

// An unknown engine falls back to the default so the video still finishes. The note is shown in the job.
export function resolveEngine(requested?: string): { engine: Engine; note?: string } {
  const fallback = engines[config.engine()] ?? engines.gemini;
  if (!requested || requested === fallback.name) return { engine: fallback };
  const engine = engines[requested];
  return engine ? { engine } : { engine: fallback, note: `Engine "${requested}" is not available, used ${fallback.label} instead` };
}
