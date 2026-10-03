// Pulse-LM: our fine-tuned Qwen3-4B planner, served locally by Ollama (llama.cpp underneath).
// It does one job: input -> script + shot plan in a single call. Output is constrained to our JSON schema.
import { z } from "zod";
import { COMBINED_SYSTEM, CombinedSchema, combinedPrompt, type Combined, type CombinedInput } from "../agents/combined";
import { config } from "../config";
import { HttpError } from "../util";
import { LlmError, type LlmAttempt, type LlmResult } from "./llm";

export type PlannerResult = LlmResult<Combined> & { tokensPerSec: number; outputTokens: number; repairs: string[] };

// The model was fine-tuned to write this JSON on its own, so it runs in plain JSON mode and zod checks the result.
// (A schema-constrained grammar made it skip every optional field, including the image prompts.)
async function chat(prompt: string): Promise<{ text: string; inputTokens: number; outputTokens: number; tokensPerSec: number }> {
  const res = await fetch(`${config.pulseLm.url()}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.pulseLm.model(),
      stream: false,
      think: false,
      format: "json",
      messages: [
        { role: "system", content: COMBINED_SYSTEM },
        { role: "user", content: prompt },
      ],
      options: { temperature: 0.3, top_p: 0.9, num_ctx: 4096, num_predict: 1800 },
    }),
    signal: AbortSignal.timeout(config.pulseLm.timeoutMs()),
  });
  const body = await res.text();
  if (!res.ok) throw new HttpError(res.status, body, "Pulse-LM");
  const json = JSON.parse(body);
  const outputTokens = json.eval_count ?? 0;
  return {
    text: json.message?.content ?? "",
    inputTokens: json.prompt_eval_count ?? 0,
    outputTokens,
    tokensPerSec: json.eval_duration ? outputTokens / (json.eval_duration / 1e9) : 0,
  };
}

export async function isPulseLmUp(): Promise<boolean> {
  try {
    const res = await fetch(`${config.pulseLm.url()}/api/version`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T, guess?: (v: string) => T | undefined): T => {
  if (typeof value === "string") {
    if ((allowed as readonly string[]).includes(value)) return value as T;
    const guessed = guess?.(value.toLowerCase());
    if (guessed) return guessed;
  }
  return fallback;
};

// The small model sometimes invents an enum value or drops a flag. These are repaired here, in code,
// and every repair is listed so the job shows exactly what was changed.
export function coercePlanner(raw: unknown): { value: unknown; repairs: string[] } {
  const repairs: string[] = [];
  if (!raw || typeof raw !== "object") return { value: raw, repairs };
  const data = raw as { script?: { scenes?: Array<Record<string, unknown>> }; plan?: { global?: Record<string, unknown>; shots?: Array<Record<string, unknown>> } };
  const note = (where: string, before: unknown, after: unknown) => {
    if (before !== after) repairs.push(`${where}: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
  };
  for (const [i, scene] of (data.script?.scenes ?? []).entries()) {
    const purpose = pick(scene.purpose, ["hook", "context", "point", "twist", "cta"] as const, i === 0 ? "hook" : "point", (v) => (v.includes("question") || v.includes("call") ? "cta" : undefined));
    note(`scene ${i + 1} purpose`, scene.purpose, purpose);
    scene.purpose = purpose;
  }
  if (data.plan?.global) {
    const mood = pick(data.plan.global.musicMood, ["upbeat", "calm", "dramatic", "inspiring"] as const, "upbeat");
    note("musicMood", data.plan.global.musicMood, mood);
    data.plan.global.musicMood = mood;
  }
  for (const [i, shot] of (data.plan?.shots ?? []).entries()) {
    const where = `shot ${i + 1}`;
    const layout = pick(shot.layout, ["full_image", "text_card", "stat_card", "quote_card"] as const, shot.visualPrompt ? "full_image" : "text_card", (v) =>
      v.includes("image") || v.includes("photo") ? "full_image" : v.includes("stat") || v.includes("number") ? "stat_card" : v.includes("quote") ? "quote_card" : undefined,
    );
    note(`${where} layout`, shot.layout, layout);
    shot.layout = layout;
    for (const [key, allowed, fallback] of [
      ["camera", ["zoom_in", "zoom_out", "pan_left", "pan_right", "static"], "zoom_in"],
      ["transition", ["cut", "fade", "slide", "zoom"], "fade"],
      ["captionStyle", ["pop", "karaoke", "minimal"], "pop"],
    ] as const) {
      const value = pick(shot[key], allowed, fallback);
      note(`${where} ${key}`, shot[key], value);
      shot[key] = value;
    }
    if (typeof shot.useHeroClip !== "boolean") {
      note(`${where} useHeroClip`, shot.useHeroClip, false);
      shot.useHeroClip = false;
    }
    if (!Array.isArray(shot.emphasisWords)) {
      note(`${where} emphasisWords`, shot.emphasisWords, []);
      shot.emphasisWords = [];
    }
  }
  return { value: data, repairs };
}

// One call, plus one corrective retry if the answer fails our validation.
export async function runPulsePlanner(input: CombinedInput): Promise<PlannerResult> {
  const model = config.pulseLm.model();
  const attempts: LlmAttempt[] = [];
  let prompt = combinedPrompt(input);
  let lastError = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    const start = Date.now();
    try {
      const out = await chat(prompt);
      const usage = { inputTokens: out.inputTokens, outputTokens: out.outputTokens };
      let parsed: unknown;
      try {
        parsed = JSON.parse(out.text);
      } catch {
        parsed = undefined;
      }
      const coerced = coercePlanner(parsed);
      const result = CombinedSchema.safeParse(coerced.value);
      if (result.success) {
        attempts.push({ model, ok: true, status: 200, rateLimited: false, limiterWaitMs: 0, backoffMs: 0, ms: Date.now() - start, ...usage });
        return { data: result.data, model, attempts, tokensPerSec: out.tokensPerSec, outputTokens: out.outputTokens, repairs: coerced.repairs };
      }
      const problem = parsed === undefined ? "Output was not valid JSON (it may have been cut off)." : z.prettifyError(result.error);
      lastError = `validation: ${problem.slice(0, 300)}`;
      attempts.push({ model, ok: false, status: 200, error: lastError, rateLimited: false, limiterWaitMs: 0, backoffMs: 0, ms: Date.now() - start, ...usage });
      prompt = `${combinedPrompt(input)}\n\nYour previous answer failed validation:\n${problem}\nReturn corrected JSON only.`;
    } catch (err) {
      lastError = (err as Error).message.slice(0, 200);
      attempts.push({ model, ok: false, status: err instanceof HttpError ? err.status : 0, error: lastError, rateLimited: false, limiterWaitMs: 0, backoffMs: 0, ms: Date.now() - start });
      break; // the server is down or timed out: do not wait again
    }
  }
  throw new LlmError(`Pulse-LM planner failed: ${lastError}`, attempts);
}
