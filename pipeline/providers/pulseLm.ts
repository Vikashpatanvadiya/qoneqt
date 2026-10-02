// Pulse-LM: our fine-tuned Qwen3-4B planner, served locally by Ollama (llama.cpp underneath).
// It does one job: input -> script + shot plan in a single call. Output is constrained to our JSON schema.
import { z } from "zod";
import { COMBINED_SYSTEM, CombinedSchema, combinedPrompt, type Combined, type CombinedInput } from "../agents/combined";
import { config } from "../config";
import { HttpError } from "../util";
import { LlmError, type LlmAttempt, type LlmResult } from "./llm";

export type PlannerResult = LlmResult<Combined> & { tokensPerSec: number; outputTokens: number };

async function chat(prompt: string, schema: unknown): Promise<{ text: string; inputTokens: number; outputTokens: number; tokensPerSec: number }> {
  const res = await fetch(`${config.pulseLm.url()}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.pulseLm.model(),
      stream: false,
      think: false,
      format: schema,
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

// One call, plus one corrective retry if the answer fails our validation.
export async function runPulsePlanner(input: CombinedInput): Promise<PlannerResult> {
  const model = config.pulseLm.model();
  const schema = z.toJSONSchema(CombinedSchema);
  const attempts: LlmAttempt[] = [];
  let prompt = combinedPrompt(input);
  let lastError = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    const start = Date.now();
    try {
      const out = await chat(prompt, schema);
      const usage = { inputTokens: out.inputTokens, outputTokens: out.outputTokens };
      let parsed: unknown;
      try {
        parsed = JSON.parse(out.text);
      } catch {
        parsed = undefined;
      }
      const result = CombinedSchema.safeParse(parsed);
      if (result.success) {
        attempts.push({ model, ok: true, status: 200, rateLimited: false, limiterWaitMs: 0, backoffMs: 0, ms: Date.now() - start, ...usage });
        return { data: result.data, model, attempts, tokensPerSec: out.tokensPerSec, outputTokens: out.outputTokens };
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
