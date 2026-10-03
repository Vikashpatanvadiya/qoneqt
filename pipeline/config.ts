import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { OUTRO_SEC } from "../shared/types";

const env = (name: string, fallback?: string): string => {
  const v = process.env[name] || fallback; // empty counts as unset (unset repo variables arrive as "")
  if (!v) throw new Error(`Missing env var ${name}. See .env.example`);
  return v;
};

const optional = (name: string): string | undefined => process.env[name] || undefined;

// Splits comma-separated values and removes duplicates, keeping the order.
const list = (...values: Array<string | undefined>): string[] => [
  ...new Set(
    values
      .flatMap((v) => (v ?? "").split(","))
      .map((v) => v.trim())
      .filter(Boolean),
  ),
];

const localPython = path.resolve(".venv/bin/python");

export const config = {
  gemini: {
    apiKey: () => env("GEMINI_API_KEY"),
    // Each of these is a comma-separated chain, tried in order. Free-tier quotas are per model per day
    // (the main model allows only 20 requests a day), so a chain multiplies what one key can do.
    textModels: () => list(env("GEMINI_MODEL_TEXT"), optional("GEMINI_MODEL_TEXT_FALLBACK")),
    // Lighter agents (Researcher, Critic, Director) start on cheaper models with higher limits.
    lightModels: () => list(optional("GEMINI_MODEL_LIGHT"), env("GEMINI_MODEL_TEXT"), optional("GEMINI_MODEL_TEXT_FALLBACK")),
    visionModels: () => list(env("GEMINI_MODEL_VISION")),
    // Free-tier requests per minute. Check the AI Studio rate-limit page for the real numbers.
    rpm: (model: string) => (/lite|gemma/i.test(model) ? Number(optional("GEMINI_RPM_OTHER") ?? 15) : Number(optional("GEMINI_RPM_MAIN") ?? 5)),
    // Default thinking made single calls take 30 to 90 sec. "low" keeps them near 10 sec.
    thinkingLevel: () => optional("GEMINI_THINKING_LEVEL") ?? "low",
  },
  cloudflare: {
    accountId: () => env("CF_ACCOUNT_ID"),
    apiToken: () => env("CF_API_TOKEN"),
    imageModel: () => env("CF_IMAGE_MODEL"),
    imageSteps: () => Number(optional("CF_IMAGE_STEPS") ?? 4),
  },
  // Backup image provider. A free token removes the logo and unlocks better models.
  pollinations: {
    token: () => optional("POLLINATIONS_TOKEN"),
    model: () => optional("POLLINATIONS_MODEL"),
  },
  tts: {
    voice: () => env("EDGE_TTS_VOICE", "en-IN-NeerjaNeural"),
    pythonBin: () => optional("PYTHON_BIN") ?? (fs.existsSync(localPython) ? localPython : "python3"),
  },
  supabase: {
    url: () => env("SUPABASE_URL"),
    serviceKey: () => env("SUPABASE_SERVICE_KEY"),
  },
  engine: () => optional("PULSE_ENGINE") ?? "gemini",
  // Pulse-LM: our fine-tuned planner, served by a local Ollama (llama.cpp) server.
  pulseLm: {
    url: () => optional("PULSE_LM_URL") ?? "http://127.0.0.1:11434",
    model: () => env("PULSE_LM_MODEL"),
    timeoutMs: () => Number(optional("PULSE_LM_TIMEOUT_SEC") ?? 600) * 1000,
  },
  // Duration governor. The limit covers the whole video including the outro.
  video: {
    maxSec: () => Number(optional("MAX_VIDEO_SEC") ?? 45),
    outroSec: OUTRO_SEC,
    wordsPerSec: 2.1, // measured from edge-tts en-IN voices
    hardMaxWordsPerScene: 24,
    minScenes: 4,
    maxSpeedUpPct: 18,
  },
  // Script Critic thresholds. A job can override them in options.critic.
  critic: {
    minOverall: () => Number(optional("CRITIC_MIN_OVERALL") ?? 7.5),
    minHook: () => Number(optional("CRITIC_MIN_HOOK") ?? 8),
    maxRevisions: 2,
  },
  // Code QA gate targets
  qa: {
    maxFileMb: 25,
    targetLufs: -16,
    lufsTolerance: 1.5,
    maxTruePeakDb: -1,
    maxSilenceSec: 1.2,
    minContrast: 4.5,
    voiceTailSec: 0.3, // silence kept after the last spoken word of a scene
  },
  render: {
    crf: () => Number(optional("RENDER_CRF") ?? 23),
    // Lower this (for example 0.75) if a render takes more than 6 minutes on the runner.
    scale: () => Number(optional("RENDER_SCALE") ?? 1),
  },
  cacheDir: () => path.resolve(optional("CACHE_DIR") ?? ".cache"),
  scenePaddingSec: 0.2,
  maxParallelAssets: 3,
};
