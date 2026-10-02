import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

const env = (name: string, fallback?: string): string => {
  const v = process.env[name] || fallback; // empty counts as unset (unset repo variables arrive as "")
  if (!v) throw new Error(`Missing env var ${name}. See .env.example`);
  return v;
};

const optional = (name: string): string | undefined => process.env[name] || undefined;

const localPython = path.resolve(".venv/bin/python");

export const config = {
  gemini: {
    apiKey: () => env("GEMINI_API_KEY"),
    textModel: () => env("GEMINI_MODEL_TEXT"),
    textFallbackModel: () => optional("GEMINI_MODEL_TEXT_FALLBACK"),
    visionModel: () => env("GEMINI_MODEL_VISION"),
    // Default thinking made single calls take 30 to 90 sec. "low" keeps them near 10 sec.
    thinkingLevel: () => optional("GEMINI_THINKING_LEVEL") ?? "low",
  },
  cloudflare: {
    accountId: () => env("CF_ACCOUNT_ID"),
    apiToken: () => env("CF_API_TOKEN"),
    imageModel: () => env("CF_IMAGE_MODEL"),
    imageSteps: () => Number(optional("CF_IMAGE_STEPS") ?? 4),
  },
  tts: {
    voice: () => env("EDGE_TTS_VOICE", "en-IN-NeerjaNeural"),
    pythonBin: () => optional("PYTHON_BIN") ?? (fs.existsSync(localPython) ? localPython : "python3"),
  },
  supabase: {
    url: () => env("SUPABASE_URL"),
    serviceKey: () => env("SUPABASE_SERVICE_KEY"),
  },
  render: {
    crf: () => Number(optional("RENDER_CRF") ?? 23),
  },
  cacheDir: () => path.resolve(optional("CACHE_DIR") ?? ".cache"),
  scenePaddingSec: 0.2,
  maxParallelAssets: 3,
};
