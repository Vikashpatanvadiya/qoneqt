import crypto from "node:crypto";

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const sha = (...parts: string[]) =>
  crypto.createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 24);

export class HttpError extends Error {
  constructor(
    public status: number,
    public body: string,
    label: string,
  ) {
    super(`${label} failed: HTTP ${status} ${body.slice(0, 300)}`);
  }

  // Gemini puts the wait time in the body of a 429 ("retryDelay": "23s").
  get retryAfterMs(): number | undefined {
    const match = this.body.match(/"retryDelay":\s*"([\d.]+)s"/);
    return match ? Math.ceil(Number(match[1]) * 1000) + 500 : undefined;
  }
}

// Retry with exponential backoff. 4xx errors other than 408/429 are not retried.
export async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 3, onFail?: (err: Error) => void): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      onFail?.(err as Error);
      const status = err instanceof HttpError ? err.status : 0;
      const retryable = status === 0 || status === 408 || status === 429 || status >= 500;
      if (!retryable || i === attempts - 1) break;
      const backoff = (status === 429 ? 8000 : 1500) * 2 ** i;
      const wait = Math.min((err instanceof HttpError && err.retryAfterMs) || backoff, 60_000);
      console.warn(`  [retry] ${label} attempt ${i + 1} failed (${(err as Error).message.slice(0, 120)}). Waiting ${wait}ms`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

// Run tasks with a concurrency cap, keeping result order.
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function timed<T>(label: string, timings: Record<string, number>, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    return await fn();
  } finally {
    timings[label] = Date.now() - start;
    console.log(`[${label}] ${(timings[label] / 1000).toFixed(1)}s`);
  }
}
