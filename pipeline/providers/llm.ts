import { z } from "zod";
import { config } from "../config";
import { HttpError, withRetry } from "../util";

export type LlmUsage = { model: string; inputTokens: number; outputTokens: number; ms: number };
export type LlmFailure = { model: string; error: string };

export type JsonRequest<T extends z.ZodType> = {
  label: string;
  system: string;
  prompt: string;
  schema: T;
};

// `usage` has one entry per successful call, `failures` one per failed attempt (rate limits, bad JSON).
export type LlmResult<T> = { data: T; usage: LlmUsage[]; failures: LlmFailure[] };

export interface LlmProvider {
  generateJson<T extends z.ZodType>(req: JsonRequest<T>): Promise<LlmResult<z.infer<T>>>;
}

const API = "https://generativelanguage.googleapis.com/v1beta/models";

// Models that rejected thinkingConfig, so it is not sent to them again.
const noThinkingConfig = new Set<string>();

async function callGemini(model: string, system: string, prompt: string, jsonSchema: unknown): Promise<{ text: string; usage: LlmUsage }> {
  const start = Date.now();
  const thinkingLevel = noThinkingConfig.has(model) ? undefined : config.gemini.thinkingLevel();
  const res = await fetch(`${API}/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": config.gemini.apiKey() },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
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
    return callGemini(model, system, prompt, jsonSchema);
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
    usage: {
      model,
      inputTokens: json.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: (json.usageMetadata?.candidatesTokenCount ?? 0) + (json.usageMetadata?.thoughtsTokenCount ?? 0),
      ms: Date.now() - start,
    },
  };
}

export const geminiLlm: LlmProvider = {
  async generateJson({ label, system, prompt, schema }) {
    const jsonSchema = z.toJSONSchema(schema);
    const models = [config.gemini.textModel(), config.gemini.textFallbackModel()].filter((m): m is string => Boolean(m));
    const usage: LlmUsage[] = [];
    const failures: LlmFailure[] = [];
    let lastErr: unknown;

    for (const model of models) {
      try {
        let attemptPrompt = prompt;
        // One extra attempt if the JSON fails validation, with the error included.
        for (let attempt = 0; attempt < 2; attempt++) {
          const out = await withRetry(
            `${label} (${model})`,
            () => callGemini(model, system, attemptPrompt, jsonSchema),
            3,
            (err) => failures.push({ model, error: err.message.slice(0, 200) }),
          );
          usage.push(out.usage);
          let parsed: unknown;
          try {
            parsed = JSON.parse(out.text);
          } catch {
            parsed = undefined;
          }
          const result = schema.safeParse(parsed);
          if (result.success) return { data: result.data, usage, failures };
          const problem = parsed === undefined ? "Output was not valid JSON." : z.prettifyError(result.error);
          failures.push({ model, error: `validation: ${problem.slice(0, 300)}` });
          lastErr = new Error(`${label}: invalid JSON from ${model}: ${problem}`);
          console.warn(`  [llm] ${label} validation failed on ${model}: ${problem.slice(0, 200)}`);
          attemptPrompt = `${prompt}\n\nYOUR PREVIOUS ANSWER\n${out.text}\n\nIt failed validation:\n${problem}\nFix exactly these problems and return corrected JSON only.`;
        }
      } catch (err) {
        lastErr = err;
        console.warn(`  [llm] ${label} failed on ${model}: ${(err as Error).message.slice(0, 200)}`);
      }
    }
    throw lastErr;
  },
};
