import fs from "node:fs";
import { z } from "zod";
import { config } from "../config";
import { HttpError, sleep } from "../util";
import { acquire } from "./limiter";

// One entry per HTTP call, successful or not. Stored in the stage output so slow stages can be explained.
export type LlmAttempt = {
  model: string;
  ok: boolean;
  status: number; // HTTP status, 0 for timeouts and network errors
  error?: string;
  rateLimited: boolean; // true when the provider answered 429
  limiterWaitMs: number; // time our own limiter held the call back
  backoffMs: number; // time waited after this attempt before the next one
  ms: number;
  inputTokens?: number;
  outputTokens?: number;
};

export type LlmResult<T> = { data: T; model: string; attempts: LlmAttempt[] };

export type ImageInput = { file: string; mimeType: string };

export type JsonRequest<T extends z.ZodType> = {
  label: string;
  system: string;
  prompt: string;
  schema: T;
  // "light" agents try the cheaper, higher-limit model first when one is configured.
  tier?: "main" | "light";
};

export interface LlmProvider {
  name: string;
  generateJson<T extends z.ZodType>(req: JsonRequest<T>): Promise<LlmResult<z.infer<T>>>;
}

export interface VisionProvider {
  name: string;
  inspectJson<T extends z.ZodType>(req: JsonRequest<T> & { images: ImageInput[] }): Promise<LlmResult<z.infer<T>>>;
}

// Thrown when every model failed. Carries the attempts so the failed stage can still show them.
export class LlmError extends Error {
  constructor(
    message: string,
    public attempts: LlmAttempt[],
  ) {
    super(message);
  }
}

const API = "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_HTTP_TRIES = 3;

// Models that rejected thinkingConfig, so it is not sent to them again.
const noThinkingConfig = new Set<string>();

type RawCall = { text: string; inputTokens: number; outputTokens: number };

async function callGemini(model: string, system: string, prompt: string, jsonSchema: unknown, images: ImageInput[]): Promise<RawCall> {
  const thinkingLevel = noThinkingConfig.has(model) ? undefined : config.gemini.thinkingLevel();
  const imageParts = images.map((img) => ({ inlineData: { mimeType: img.mimeType, data: fs.readFileSync(img.file).toString("base64") } }));
  const res = await fetch(`${API}/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": config.gemini.apiKey() },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [...imageParts, { text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseJsonSchema: jsonSchema,
        ...(thinkingLevel ? { thinkingConfig: { thinkingLevel } } : {}),
      },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const body = await res.text();
  if (res.status === 400 && thinkingLevel && /thinking/i.test(body)) {
    noThinkingConfig.add(model);
    return callGemini(model, system, prompt, jsonSchema, images);
  }
  if (!res.ok) throw new HttpError(res.status, body, `Gemini ${model}`);
  const json = JSON.parse(body);
  const text = (json.candidates?.[0]?.content?.parts ?? [])
    .filter((p: { text?: string; thought?: boolean }) => p.text && !p.thought)
    .map((p: { text: string }) => p.text)
    .join("");
  if (!text) throw new Error(`Gemini ${model} returned no text (finishReason: ${json.candidates?.[0]?.finishReason})`);
  return {
    text,
    inputTokens: json.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: (json.usageMetadata?.candidatesTokenCount ?? 0) + (json.usageMetadata?.thoughtsTokenCount ?? 0),
  };
}

const shortError = (err: unknown): string => {
  if (err instanceof HttpError) {
    try {
      return String(JSON.parse(err.body).error?.message ?? err.body).slice(0, 200);
    } catch {
      return err.body.slice(0, 200);
    }
  }
  return (err as Error).message.slice(0, 200);
};

async function runJson<T extends z.ZodType>(models: string[], req: JsonRequest<T>, images: ImageInput[]): Promise<LlmResult<z.infer<T>>> {
  const jsonSchema = z.toJSONSchema(req.schema);
  const attempts: LlmAttempt[] = [];
  let lastError = "no model configured";

  for (const [index, model] of models.entries()) {
    const hasNextModel = index < models.length - 1;
    let prompt = req.prompt;
    let httpFails = 0;
    let validationFails = 0;

    for (;;) {
      const limiterWaitMs = await acquire(model, config.gemini.rpm(model));
      const start = Date.now();
      let raw: RawCall;
      try {
        raw = await callGemini(model, req.system, prompt, jsonSchema, images);
      } catch (err) {
        const status = err instanceof HttpError ? err.status : 0;
        const rateLimited = status === 429;
        const retryable = status === 0 || status === 408 || rateLimited || status >= 500;
        httpFails++;
        // A rate-limited model is not worth waiting for when another model is available.
        const retry = retryable && httpFails < MAX_HTTP_TRIES && !(rateLimited && hasNextModel);
        const backoffMs = retry ? Math.min((err instanceof HttpError && err.retryAfterMs) || (rateLimited ? 8000 : 1500) * 2 ** (httpFails - 1), 60_000) : 0;
        lastError = `${model}: ${status || "network"} ${shortError(err)}`;
        attempts.push({ model, ok: false, status, error: shortError(err), rateLimited, limiterWaitMs, backoffMs, ms: Date.now() - start });
        console.warn(`  [llm] ${req.label} on ${model} failed (${status || "timeout/network"}${rateLimited ? ", rate limited" : ""})${retry ? `, retrying in ${backoffMs}ms` : hasNextModel ? ", switching model" : ""}`);
        if (!retry) break;
        await sleep(backoffMs);
        continue;
      }

      const usage = { inputTokens: raw.inputTokens, outputTokens: raw.outputTokens };
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.text);
      } catch {
        parsed = undefined;
      }
      const result = req.schema.safeParse(parsed);
      if (result.success) {
        attempts.push({ model, ok: true, status: 200, rateLimited: false, limiterWaitMs, backoffMs: 0, ms: Date.now() - start, ...usage });
        return { data: result.data, model, attempts };
      }

      // One corrective retry per model, with the validation error included.
      const problem = parsed === undefined ? "Output was not valid JSON." : z.prettifyError(result.error);
      lastError = `${model}: validation failed: ${problem.slice(0, 300)}`;
      attempts.push({ model, ok: false, status: 200, error: `validation: ${problem.slice(0, 300)}`, rateLimited: false, limiterWaitMs, backoffMs: 0, ms: Date.now() - start, ...usage });
      console.warn(`  [llm] ${req.label} on ${model} failed validation: ${problem.slice(0, 200)}`);
      if (++validationFails > 1) break;
      prompt = `${req.prompt}\n\nYOUR PREVIOUS ANSWER\n${raw.text}\n\nIt failed validation:\n${problem}\nFix exactly these problems and return corrected JSON only.`;
    }
  }
  throw new LlmError(`${req.label} failed on every model. Last error: ${lastError}`, attempts);
}

const unique = (models: Array<string | undefined>) => [...new Set(models.filter((m): m is string => Boolean(m)))];

export const geminiLlm: LlmProvider = {
  name: "gemini",
  generateJson(req) {
    const { textModel, textFallbackModel, lightModel } = config.gemini;
    const models = req.tier === "light" ? unique([lightModel(), textModel(), textFallbackModel()]) : unique([textModel(), textFallbackModel()]);
    return runJson(models, req, []);
  },
};

export const geminiVision: VisionProvider = {
  name: "gemini",
  inspectJson(req) {
    return runJson(unique([config.gemini.visionModel()]), req, req.images);
  },
};

export function summarizeAttempts(attempts: LlmAttempt[]) {
  return {
    calls: attempts.length,
    failed: attempts.filter((a) => !a.ok).length,
    rateLimitHits: attempts.filter((a) => a.rateLimited).length,
    waitMs: attempts.reduce((n, a) => n + a.limiterWaitMs + a.backoffMs, 0),
    inputTokens: attempts.reduce((n, a) => n + (a.inputTokens ?? 0), 0),
    outputTokens: attempts.reduce((n, a) => n + (a.outputTokens ?? 0), 0),
  };
}
