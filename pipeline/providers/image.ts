import fs from "node:fs";
import path from "node:path";
import { config } from "../config";
import { HttpError, sha, withRetry } from "../util";

export type ImageResult = {
  file: string;
  cached: boolean;
  provider: string;
  model: string;
  steps: number;
  ms: number;
  // Problems with providers earlier in the chain, so the job can say why a backup was used.
  fallbackFrom?: string[];
};

export interface ImageProvider {
  name: string;
  generate(prompt: string): Promise<ImageResult>;
}

const cacheFile = (...parts: string[]) => {
  const dir = path.join(config.cacheDir(), "images");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${sha(...parts)}.jpg`);
};

// A provider whose daily free quota is used up is skipped for the rest of this run instead of retried.
// Status 402 is not retried by withRetry.
class QuotaError extends HttpError {
  constructor(message: string) {
    super(402, message, "Quota");
    this.message = message;
  }
}

// Without a token Pollinations serves one request at a time per caller, so calls are queued.
let pollinationsQueue: Promise<unknown> = Promise.resolve();
const oneAtATime = <T>(fn: () => Promise<T>): Promise<T> => {
  const run = pollinationsQueue.then(fn, fn);
  pollinationsQueue = run.catch(() => undefined);
  return run;
};

// Cloudflare Workers AI FLUX schnell. The model only accepts prompt, steps and seed,
// so the output is square and the composition crops it to 9:16.
export const cloudflareImage: ImageProvider = {
  name: "cloudflare-flux",
  async generate(prompt) {
    const model = config.cloudflare.imageModel();
    const steps = config.cloudflare.imageSteps();
    const file = cacheFile(prompt, model, String(steps));
    if (fs.existsSync(file)) return { file, cached: true, provider: this.name, model, steps, ms: 0 };

    const start = Date.now();
    const base64 = await withRetry(`image ${model}`, async () => {
      const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${config.cloudflare.accountId()}/ai/run/${model}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.cloudflare.apiToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, steps }),
        signal: AbortSignal.timeout(90_000),
      });
      const body = await res.text();
      if (res.status === 429 && /daily free allocation/i.test(body)) throw new QuotaError("Cloudflare daily free allocation of 10,000 neurons is used up (resets 5:30 AM IST)");
      if (!res.ok) throw new HttpError(res.status, body, `Cloudflare ${model}`);
      const image = JSON.parse(body).result?.image;
      if (!image) throw new Error(`Cloudflare ${model} returned no image`);
      return image as string;
    });
    fs.writeFileSync(file, Buffer.from(base64, "base64"));
    return { file, cached: false, provider: this.name, model, steps, ms: Date.now() - start };
  },
};

// Pollinations: free, no card. With a token (POLLINATIONS_TOKEN) it uses the newer API: real 9:16 images,
// a choice of models (flux, zimage, klein) and no logo. Without one it falls back to the anonymous endpoint,
// which is slow, rate limited and adds a small logo.
export const pollinationsImage: ImageProvider = {
  name: "pollinations",
  async generate(prompt) {
    const token = config.pollinations.token();
    const model = token ? (config.pollinations.model() ?? "flux") : "anonymous";
    const file = cacheFile(prompt, "pollinations", model);
    if (fs.existsSync(file)) return { file, cached: true, provider: this.name, model, steps: 0, ms: 0 };

    const start = Date.now();
    const params = new URLSearchParams({ width: "768", height: "1344", nologo: "true", seed: String(parseInt(sha(prompt).slice(0, 8), 16) % 1_000_000) });
    if (token) params.set("model", model);
    const url = token
      ? `https://gen.pollinations.ai/image/${encodeURIComponent(prompt.slice(0, 900))}?${params}`
      : `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.slice(0, 900))}?${params}`;
    const request = () =>
      withRetry(`image pollinations ${model}`, async () => {
        const res = await fetch(url, { headers: { "User-Agent": "qoneqt-pulse", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, signal: AbortSignal.timeout(120_000) });
        const body = res.ok ? null : await res.text();
        if (res.status === 402 && token) throw new QuotaError(`Pollinations: out of free pollen for today (${body?.slice(0, 120)})`);
        // Anonymous callers get 402 or 429 when the queue is busy, so those are retried like a rate limit.
        if (!res.ok) throw new HttpError(res.status === 402 ? 429 : res.status, body ?? "", "Pollinations");
        if (!(res.headers.get("content-type") ?? "").startsWith("image/")) throw new Error("Pollinations did not return an image");
        return Buffer.from(await res.arrayBuffer());
      });
    // Anonymous use allows one request at a time. With a token, requests run in parallel.
    const bytes = token ? await request() : await oneAtATime(request);
    fs.writeFileSync(file, bytes);
    return { file, cached: false, provider: this.name, model, steps: 0, ms: Date.now() - start };
  },
};

const exhausted = new Map<string, string>();

// Tries each provider in order. The caller falls back to a designed card if every provider fails.
export function chainImages(providers: ImageProvider[]): ImageProvider {
  return {
    name: providers.map((p) => p.name).join(" > "),
    async generate(prompt) {
      const problems: string[] = [];
      for (const provider of providers) {
        if (exhausted.has(provider.name)) {
          problems.push(exhausted.get(provider.name)!);
          continue;
        }
        try {
          const result = await provider.generate(prompt);
          return problems.length ? { ...result, fallbackFrom: problems } : result;
        } catch (err) {
          const message = (err as Error).message.slice(0, 200);
          if (err instanceof QuotaError) exhausted.set(provider.name, message);
          problems.push(`${provider.name}: ${message}`);
        }
      }
      throw new Error(`Every image provider failed. ${problems.join(" | ")}`);
    },
  };
}

// Order comes from IMAGE_PROVIDERS (for example "pollinations,cloudflare"). By default Pollinations goes first
// when a token is set, because it returns real 9:16 images and has a separate free allowance.
const registry: Record<string, ImageProvider> = { cloudflare: cloudflareImage, pollinations: pollinationsImage };
const order = (config.images.order() ?? (config.pollinations.token() ? "pollinations,cloudflare" : "cloudflare,pollinations"))
  .split(",")
  .map((n) => registry[n.trim()])
  .filter(Boolean);
export const defaultImages = chainImages(order.length ? order : [cloudflareImage, pollinationsImage]);
