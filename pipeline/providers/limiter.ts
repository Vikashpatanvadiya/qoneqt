import { sleep } from "../util";

// Sliding-window limiter: at most `perMinute` calls per key in any 60 seconds.
// It only sees this process. Parallel batch jobs are spread out by staggered starts and 429 handling.
const WINDOW_MS = 60_000;
const calls = new Map<string, number[]>();
const queues = new Map<string, Promise<unknown>>();

async function waitForSlot(key: string, perMinute: number): Promise<number> {
  const started = Date.now();
  for (;;) {
    const now = Date.now();
    const recent = (calls.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
    if (recent.length < perMinute) {
      calls.set(key, [...recent, now]);
      return now - started;
    }
    const wait = recent[0] + WINDOW_MS - now + 100;
    console.log(`  [limiter] ${key} is at ${perMinute} calls per minute, waiting ${(wait / 1000).toFixed(1)}s`);
    await sleep(wait);
  }
}

// Returns how long the caller had to wait, in ms.
export function acquire(key: string, perMinute: number): Promise<number> {
  const next = (queues.get(key) ?? Promise.resolve()).then(() => waitForSlot(key, perMinute));
  queues.set(key, next.catch(() => undefined));
  return next;
}
