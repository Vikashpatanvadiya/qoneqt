import fs from "node:fs";
import path from "node:path";
import { config } from "../config";
import { HttpError, sha, withRetry } from "../util";

export type ImageResult = { file: string; cached: boolean; model: string; steps: number; ms: number };

export interface ImageProvider {
  generate(prompt: string): Promise<ImageResult>;
}

// Cloudflare Workers AI FLUX schnell. The model only accepts prompt, steps and seed,
// so the output is square and the composition crops it to 9:16.
export const cloudflareImage: ImageProvider = {
  async generate(prompt) {
    const model = config.cloudflare.imageModel();
    const steps = config.cloudflare.imageSteps();
    const dir = path.join(config.cacheDir(), "images");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${sha(prompt, model, String(steps))}.jpg`);
    if (fs.existsSync(file)) return { file, cached: true, model, steps, ms: 0 };

    const start = Date.now();
    const base64 = await withRetry(`image ${model}`, async () => {
      const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${config.cloudflare.accountId()}/ai/run/${model}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.cloudflare.apiToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, steps }),
      });
      const body = await res.text();
      if (!res.ok) throw new HttpError(res.status, body, `Cloudflare ${model}`);
      const image = JSON.parse(body).result?.image;
      if (!image) throw new Error(`Cloudflare ${model} returned no image`);
      return image as string;
    });
    fs.writeFileSync(file, Buffer.from(base64, "base64"));
    return { file, cached: false, model, steps, ms: Date.now() - start };
  },
};
