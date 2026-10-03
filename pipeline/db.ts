import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import fs from "node:fs";
import { config } from "./config";
import type { StageName, StageRunner } from "./generate";

export const BUCKET = "videos";

let client: SupabaseClient | undefined;
export const db = (): SupabaseClient =>
  (client ??= createClient(config.supabase.url(), config.supabase.serviceKey(), { auth: { persistSession: false } }));

const check = <T>(label: string, res: { data: T; error: { message: string } | null }): T => {
  if (res.error) throw new Error(`Supabase ${label}: ${res.error.message}`);
  return res.data;
};

export async function getJob(jobId: string) {
  return check("get job", await db().from("jobs").select("*").eq("id", jobId).maybeSingle());
}

export async function getCommunity(communityId: string) {
  return check("get community", await db().from("communities").select("name, profile").eq("id", communityId).maybeSingle());
}

export async function updateJob(jobId: string, patch: Record<string, unknown>) {
  check("update job", await db().from("jobs").update(patch).eq("id", jobId));
}

// Writes one `stages` row per stage so the UI can follow the job live.
export function createStageRunner(jobId: string, stageMs: Record<string, number>): StageRunner {
  let seq = 0;
  return async (name: StageName, fn) => {
    const started = Date.now();
    const row = check(
      `insert stage ${name}`,
      await db().from("stages").insert({ job_id: jobId, seq: ++seq, name, status: "running", started_at: new Date().toISOString() }).select("id").single(),
    );
    const finish = async (patch: Record<string, unknown>) => {
      stageMs[name] = Date.now() - started;
      check(`update stage ${name}`, await db().from("stages").update({ ...patch, ended_at: new Date().toISOString() }).eq("id", row!.id));
    };
    try {
      const { value, summary, reason, output, retries, status } = await fn();
      await finish({ status: status ?? "done", summary, reason, output, retries: retries ?? 0 });
      console.log(`[${name}] ${(stageMs[name] / 1000).toFixed(1)}s - ${summary}`);
      return value;
    } catch (err) {
      const attempts = (err as { attempts?: unknown }).attempts;
      await finish({ status: "failed", summary: (err as Error).message.slice(0, 500), output: attempts ? { attempts } : null }).catch(() => {});
      throw err;
    }
  };
}

export async function uploadFile(storagePath: string, file: string, contentType: string): Promise<string> {
  check("upload", await db().storage.from(BUCKET).upload(storagePath, fs.readFileSync(file), { contentType, upsert: true }));
  return db().storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;
}

const CONTENT_TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", svg: "image/svg+xml", mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", json: "application/json" };

// Saves the render inputs (props.json and every file it points to) under <job>/edit/,
// so the browser editor can preview the video and a re-render can start from it.
export async function saveEditBundle(jobId: string, propsFile: string, publicDir: string): Promise<number> {
  const props = JSON.parse(fs.readFileSync(propsFile, "utf8"));
  const names = new Set<string>();
  for (const scene of props.scenes ?? []) {
    if (scene.imageFile) names.add(scene.imageFile);
    if (scene.audioFile) names.add(scene.audioFile);
  }
  for (const n of [props.musicFile, props.logoFile, props.grainFile, props.sound?.bedFile, ...Object.values(props.sound?.sfx ?? {})]) if (typeof n === "string") names.add(n);
  const files = [...names].filter((n) => !/^https?:/.test(n) && fs.existsSync(`${publicDir}/${n}`));
  await Promise.all(files.map((n) => uploadFile(`${jobId}/edit/${n}`, `${publicDir}/${n}`, CONTENT_TYPES[n.split(".").pop() ?? ""] ?? "application/octet-stream")));
  const { assetBase: _drop, ...clean } = props;
  const tmp = `${propsFile}.edit.json`;
  fs.writeFileSync(tmp, JSON.stringify(clean));
  await uploadFile(`${jobId}/edit/props.json`, tmp, "application/json");
  return files.length;
}
