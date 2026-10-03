// Vercel function. POST creates job(s) and dispatches one GitHub Action run per job. GET ?id= returns a job with its stages.
// DELETE ?id= removes a job, its stages and its files, for the signed-in owner only.
// Guests (no login) can make one video per network per day; signed-in users get the normal limits.
// Self-contained on purpose: it never renders and imports nothing from /pipeline.
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "node:crypto";

const INPUT_TYPES = ["topic", "trend", "thread", "idea", "video"];

// Clipper jobs ("video"): one source per job, a link or an upload, and the rights tick is required.
function clipError(options: unknown): string | null {
  const clip = (options as { clip?: Record<string, unknown> } | null)?.clip;
  if (!clip || typeof clip !== "object") return "Clipper jobs need options.clip";
  if (clip.rightsConfirmed !== true) return "Confirm that you own the video or have permission to use it";
  const src = (clip.source ?? {}) as Record<string, unknown>;
  if (src.kind === "url") return typeof src.url === "string" && /^https?:\/\/\S{4,500}$/.test(src.url) ? null : "Paste a full video link (https://...)";
  if (src.kind === "upload") return typeof src.path === "string" && /^uploads\/[0-9a-f-]{36}\/source\.(mp4|mov|webm|mkv|m4v)$/.test(src.path) ? null : "The uploaded video was not found";
  return "Give a video link or upload a file";
}
const MAX_INPUTS = 10;
const MAX_INPUT_CHARS = 6000;

const env = (name: string, fallback?: string): string => {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
};

const supabase = () => createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_KEY"), { auth: { persistSession: false } });

const ENGINES = ["gemini", "pulse-lm"];
const GUEST_VIDEOS_PER_DAY = Number(process.env.GUEST_VIDEOS_PER_DAY ?? 1);

// The signed-in user from "Authorization: Bearer <access token>", or null for guests.
async function currentUser(req: VercelRequest) {
  const header = String(req.headers.authorization ?? "");
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  const { data, error } = await supabase().auth.getUser(token);
  return error ? null : data.user;
}

// True once supabase/migrations/002_auth.sql has been run. Until then login still works but jobs are not linked to users.
let userColumn: boolean | undefined;
async function hasUserColumn(): Promise<boolean> {
  if (userColumn === undefined) userColumn = !(await supabase().from("jobs").select("user_id").limit(1)).error;
  return userColumn;
}

const networkHash = (req: VercelRequest) => {
  const ip = String(req.headers["x-forwarded-for"] ?? "unknown").split(",")[0].trim();
  return crypto.createHash("sha256").update(ip + env("SUPABASE_SERVICE_KEY")).digest("hex").slice(0, 16);
};

async function dispatchRender(jobId: string, delaySec: number, engine: string): Promise<void> {
  const url = `https://api.github.com/repos/${env("GH_OWNER")}/${env("GH_REPO")}/actions/workflows/render.yml/dispatches`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env("GH_PAT")}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "qoneqt-pulse",
    },
    body: JSON.stringify({ ref: env("GH_REF", "main"), inputs: { job_id: jobId, delay_sec: String(delaySec), engine } }),
  });
  if (!res.ok) throw new Error(`GitHub dispatch failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
}

async function getJob(req: VercelRequest, res: VercelResponse) {
  const id = String(req.query.id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: "Pass a valid job id as ?id=" });
  const db = supabase();
  const job = await db.from("jobs").select("*").eq("id", id).maybeSingle();
  if (job.error) throw new Error(job.error.message);
  if (!job.data) return res.status(404).json({ error: "Job not found" });
  const stages = await db.from("stages").select("*").eq("job_id", id).order("seq");
  if (stages.error) throw new Error(stages.error.message);
  return res.status(200).json({ job: job.data, stages: stages.data });
}

async function createJobs(req: VercelRequest, res: VercelResponse) {
  const body = (typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body) ?? {};
  const inputType = String(body.input_type ?? "topic");
  const rawInputs: unknown[] = Array.isArray(body.inputs) ? body.inputs : [body.input_text];
  const inputs = rawInputs.map((s) => String(s ?? "").trim()).filter(Boolean);

  if (!INPUT_TYPES.includes(inputType)) return res.status(400).json({ error: `input_type must be one of: ${INPUT_TYPES.join(", ")}` });
  if (inputs.length === 0) return res.status(400).json({ error: "Give at least one input" });
  if (inputType === "video") {
    const problem = clipError(body.options);
    if (problem) return res.status(400).json({ error: problem });
    if (inputs.length > 1) return res.status(400).json({ error: "One video per Clipper job" });
  }
  if (inputs.length > MAX_INPUTS) return res.status(400).json({ error: `At most ${MAX_INPUTS} inputs per request` });
  if (inputs.some((s) => s.length < 3 || s.length > MAX_INPUT_CHARS)) {
    return res.status(400).json({ error: `Each input must be 3 to ${MAX_INPUT_CHARS} characters` });
  }

  // Fail before creating any job if the deployment is missing configuration.
  for (const name of ["GH_OWNER", "GH_REPO", "GH_PAT"]) env(name);

  const db = supabase();
  const user = await currentUser(req);
  const ipHash = networkHash(req);

  // Guests can try it once: one video, no batch.
  if (!user) {
    if (inputs.length > 1) return res.status(401).json({ error: "Log in to use batch mode.", needLogin: true });
    const since = new Date(Date.now() - 86_400_000).toISOString();
    let query = db.from("jobs").select("id", { count: "exact", head: true }).gte("created_at", since).neq("status", "failed").eq("options->>ipHash", ipHash);
    if (await hasUserColumn()) query = query.is("user_id", null);
    const guest = await query;
    if (guest.error) throw new Error(guest.error.message);
    if ((guest.count ?? 0) >= GUEST_VIDEOS_PER_DAY) {
      return res.status(401).json({ error: "You have used your free try. Log in to make more videos.", needLogin: true });
    }
  }
  const maxPerIp = Number(process.env.MAX_JOBS_PER_IP_PER_HOUR ?? 5);
  const maxPerDay = Number(process.env.MAX_JOBS_PER_DAY ?? 40);
  // Failed jobs do not count towards either limit.
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();

  const [byIp, byDay] = await Promise.all([
    db.from("jobs").select("id", { count: "exact", head: true }).gte("created_at", hourAgo).neq("status", "failed").eq("options->>ipHash", ipHash),
    db.from("jobs").select("id", { count: "exact", head: true }).gte("created_at", dayAgo).neq("status", "failed"),
  ]);
  if (byIp.error || byDay.error) throw new Error((byIp.error ?? byDay.error)!.message);
  if ((byIp.count ?? 0) + inputs.length > maxPerIp) {
    return res.status(429).json({ error: `Limit reached: ${maxPerIp} videos per hour from one network. Browse the gallery meanwhile.` });
  }
  if ((byDay.count ?? 0) + inputs.length > maxPerDay) {
    return res.status(429).json({ error: "Free daily quota reached. Resets at 5:30 AM IST. Browse the pre-made gallery meanwhile." });
  }

  const batchId = inputs.length > 1 ? crypto.randomUUID() : null;
  let requested = typeof body.options === "object" && body.options ? body.options : {};
  // An edited version keeps the source video's settings; only the edit itself comes from the request.
  if (requested.edit && typeof requested.edit.fromJob === "string") {
    const src = await db.from("jobs").select("status, options, community_id").eq("id", requested.edit.fromJob).maybeSingle();
    if (src.error || !src.data || src.data.status !== "done") return res.status(400).json({ error: "The video to edit was not found or is not finished" });
    const { ipHash: _ip, edit: _old, ...inherited } = (src.data.options ?? {}) as Record<string, unknown>;
    requested = { ...inherited, edit: requested.edit };
    body.community_id = src.data.community_id;
  }
  // The engine decides whether the worker starts our own model, so only known names are passed on.
  const engine = ENGINES.includes(requested.engine) ? String(requested.engine) : "gemini";
  const options = { ...requested, engine, ipHash };
  const linkUser = await hasUserColumn();
  const inserted = await db
    .from("jobs")
    .insert(inputs.map((input_text) => ({ input_type: inputType, input_text, batch_id: batchId, community_id: body.community_id ?? null, options, ...(linkUser ? { user_id: user?.id ?? null } : {}) })))
    .select("id");
  if (inserted.error) throw new Error(inserted.error.message);

  const jobs: Array<{ id: string; status: string; error?: string }> = [];
  // Each batch job starts a little later than the one before, so they do not hit the free LLM rate limit together.
  const staggerSec = Number(process.env.BATCH_STAGGER_SEC ?? 20);
  for (const [index, { id }] of inserted.data.entries()) {
    try {
      await dispatchRender(id, index * staggerSec, engine);
      jobs.push({ id, status: "queued" });
    } catch (err) {
      const error = (err as Error).message;
      await db.from("jobs").update({ status: "failed", error }).eq("id", id);
      jobs.push({ id, status: "failed", error });
    }
  }
  return res.status(jobs.some((j) => j.status === "queued") ? 201 : 502).json({ batch_id: batchId, jobs });
}

async function deleteJob(req: VercelRequest, res: VercelResponse) {
  const id = String(req.query.id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: "Pass a valid job id as ?id=" });
  const user = await currentUser(req);
  if (!user) return res.status(401).json({ error: "Log in to delete videos.", needLogin: true });
  const db = supabase();
  if (!(await hasUserColumn())) return res.status(503).json({ error: "Deleting needs the login database update (supabase/migrations/002_auth.sql)." });
  const job = await db.from("jobs").select("id, user_id, status").eq("id", id).maybeSingle();
  if (job.error) throw new Error(job.error.message);
  if (!job.data) return res.status(404).json({ error: "Video not found" });
  if (job.data.user_id !== user.id) return res.status(403).json({ error: "You can only delete your own videos." });
  if (job.data.status === "queued" || job.data.status === "running") return res.status(409).json({ error: "Wait until the video has finished." });

  // Files first (video, thumbnail, stills), then the job row. Stages go with it (on delete cascade).
  const bucket = db.storage.from("videos");
  const [top, stills, edit] = await Promise.all([bucket.list(id, { limit: 100 }), bucket.list(`${id}/stills`, { limit: 200 }), bucket.list(`${id}/edit`, { limit: 200 })]);
  const paths = [
    ...(top.data ?? []).filter((f) => f.id).map((f) => `${id}/${f.name}`),
    ...(stills.data ?? []).map((f) => `${id}/stills/${f.name}`),
    ...(edit.data ?? []).map((f) => `${id}/edit/${f.name}`),
  ];
  if (paths.length) {
    const removed = await bucket.remove(paths);
    if (removed.error) throw new Error(removed.error.message);
  }
  const deleted = await db.from("jobs").delete().eq("id", id).eq("user_id", user.id);
  if (deleted.error) throw new Error(deleted.error.message);
  return res.status(200).json({ deleted: id, files: paths.length });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === "GET") return await getJob(req, res);
    if (req.method === "POST") return await createJobs(req, res);
    if (req.method === "DELETE") return await deleteJob(req, res);
    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: (err as Error).message });
  }
}
