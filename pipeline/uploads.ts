// The user's own images: download, check, grade and place them on scenes.
// Placement order: inline tags in the script ([img2]), then matching by meaning with a vision model.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { config } from "./config";
import { gradeImage } from "./imageLook";
import type { LlmAttempt, VisionProvider } from "./providers/llm";
import type { Script } from "./schemas";

export type UploadRef = { index: number; path: string; name: string };
export type MediaOptions = { mode: "mixed" | "ai" | "uploads"; uploads: UploadRef[] };
export type Placement = { sceneId: string; index: number; name: string; file: string; url: string; how: "tag" | "matched"; why?: string };

export function parseMedia(raw: unknown): MediaOptions {
  const o = (raw && typeof raw === "object" ? raw : {}) as { mode?: unknown; uploads?: unknown };
  const mode = o.mode === "ai" || o.mode === "uploads" ? o.mode : "mixed";
  const uploads = (Array.isArray(o.uploads) ? o.uploads : [])
    .filter((u): u is UploadRef => !!u && typeof u.path === "string" && /^uploads\/[0-9a-f-]{36}\/\d{1,2}\.(jpg|png|webp)$/.test(u.path) && typeof u.index === "number")
    .slice(0, 10)
    .map((u) => ({ index: u.index, path: u.path, name: typeof u.name === "string" ? u.name.slice(0, 80) : `image ${u.index}` }));
  return { mode, uploads };
}

const publicUrl = (p: string) => `${config.supabase.url()}/storage/v1/object/public/videos/${p}`;

const MatchSchema = z.object({ matches: z.array(z.object({ image: z.number().int(), sceneId: z.string(), why: z.string() })) });

export async function placeUploads(input: {
  media: MediaOptions;
  script: Script;
  tags: Map<string, number>;
  theme: string | undefined;
  publicDir: string;
  workDir: string;
  vision: VisionProvider;
}): Promise<{ placements: Placement[]; problems: string[]; attempts: LlmAttempt[] }> {
  const problems: string[] = [];
  const attempts: LlmAttempt[] = [];
  if (input.media.mode === "ai" || input.media.uploads.length === 0) return { placements: [], problems, attempts };

  // Download and validate each upload.
  const dir = path.join(input.workDir, "uploads");
  fs.mkdirSync(dir, { recursive: true });
  const ready: Array<UploadRef & { local: string; graded: string }> = [];
  for (const u of input.media.uploads) {
    try {
      const res = await fetch(publicUrl(u.path), { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const local = path.join(dir, path.basename(u.path));
      fs.writeFileSync(local, Buffer.from(await res.arrayBuffer()));
      execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width", "-of", "csv=p=0", local]);
      const graded = `u${u.index}.jpg`;
      gradeImage({ inFile: local, outFile: path.join(input.publicDir, graded), theme: input.theme });
      ready.push({ ...u, local, graded });
    } catch (err) {
      problems.push(`${u.name}: could not be used (${(err as Error).message.slice(0, 80)})`);
    }
  }

  const placements: Placement[] = [];
  const used = new Set<number>();
  const taken = new Set<string>();
  // 1. Inline tags win.
  for (const [sceneId, index] of input.tags) {
    const u = ready.find((r) => r.index === index);
    if (!u) {
      problems.push(`${sceneId}: tag [img${index}] has no matching upload`);
      continue;
    }
    placements.push({ sceneId, index, name: u.name, file: u.graded, url: publicUrl(u.path), how: "tag" });
    used.add(index);
    taken.add(sceneId);
  }
  // 2. The rest are matched by meaning, each image at most once.
  const rest = ready.filter((r) => !used.has(r.index));
  const open = input.script.scenes.filter((s) => !taken.has(s.id));
  if (rest.length && open.length) {
    try {
      const res = await input.vision.inspectJson({
        label: "match uploads",
        system: "You place a creator's own photos in their short video. Match each photo to the scene whose line it fits best. Use each photo at most once and each scene at most once. Leave a photo out if nothing fits. Return only JSON.",
        prompt: `Photos are attached in order: ${rest.map((r, i) => `photo ${i + 1} = image ${r.index}`).join(", ")}.\n\nScenes:\n${open.map((s) => `${s.id}: ${s.narration}`).join("\n")}\n\nReturn matches with "image" set to the image number.`,
        schema: MatchSchema,
        images: rest.map((r) => ({ file: path.join(input.publicDir, r.graded), mimeType: "image/jpeg" })),
        tier: "light",
      });
      attempts.push(...res.attempts);
      for (const m of res.data.matches) {
        const u = rest.find((r) => r.index === m.image);
        if (!u || used.has(u.index) || taken.has(m.sceneId) || !open.some((s) => s.id === m.sceneId)) continue;
        placements.push({ sceneId: m.sceneId, index: u.index, name: u.name, file: u.graded, url: publicUrl(u.path), how: "matched", why: m.why });
        used.add(u.index);
        taken.add(m.sceneId);
      }
    } catch (err) {
      // Without the vision model, the remaining photos go to image-less scenes in order.
      problems.push(`Matching by meaning failed, placed in order instead (${(err as Error).message.slice(0, 80)})`);
      for (const u of rest) {
        const scene = open.find((s) => !taken.has(s.id));
        if (!scene) break;
        placements.push({ sceneId: scene.id, index: u.index, name: u.name, file: u.graded, url: publicUrl(u.path), how: "matched" });
        taken.add(scene.id);
      }
    }
  }
  return { placements, problems, attempts };
}
