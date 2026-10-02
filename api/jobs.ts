// Vercel function. POST creates job(s) and dispatches one GitHub Action run per job. GET ?id= returns a job with its stages.
// Self-contained on purpose: it never renders and imports nothing from /pipeline.
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "node:crypto";

const INPUT_TYPES = ["topic", "trend", "thread", "idea"];
const MAX_INPUTS = 10;
const MAX_INPUT_CHARS = 6000;

const env = (name: string, fallback?: string): string => {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
};

const supabase = () => createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_KEY"), { auth: { persistSession: false } });

async function dispatchRender(jobId: string): Promise<void> {
  const url = `https://api.github.com/repos/${env("GH_OWNER")}/${env("GH_REPO")}/actions/workflows/render.yml/dispatches`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env("GH_PAT")}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "qoneqt-pulse",
    },
    body: JSON.stringify({ ref: env("GH_REF", "main"), inputs: { job_id: jobId } }),
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
  if (inputs.length > MAX_INPUTS) return res.status(400).json({ error: `At most ${MAX_INPUTS} inputs per request` });
  if (inputs.some((s) => s.length < 3 || s.length > MAX_INPUT_CHARS)) {
    return res.status(400).json({ error: `Each input must be 3 to ${MAX_INPUT_CHARS} characters` });
  }

  const db = supabase();
  const ip = String(req.headers["x-forwarded-for"] ?? "unknown").split(",")[0].trim();
  const ipHash = crypto.createHash("sha256").update(ip + env("SUPABASE_SERVICE_KEY")).digest("hex").slice(0, 16);
  const maxPerIp = Number(process.env.MAX_JOBS_PER_IP_PER_HOUR ?? 5);
  const maxPerDay = Number(process.env.MAX_JOBS_PER_DAY ?? 40);
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();

  const [byIp, byDay] = await Promise.all([
    db.from("jobs").select("id", { count: "exact", head: true }).gte("created_at", hourAgo).eq("options->>ipHash", ipHash),
    db.from("jobs").select("id", { count: "exact", head: true }).gte("created_at", dayAgo),
  ]);
  if (byIp.error || byDay.error) throw new Error((byIp.error ?? byDay.error)!.message);
  if ((byIp.count ?? 0) + inputs.length > maxPerIp) {
    return res.status(429).json({ error: `Limit reached: ${maxPerIp} videos per hour from one network. Browse the gallery meanwhile.` });
  }
  if ((byDay.count ?? 0) + inputs.length > maxPerDay) {
    return res.status(429).json({ error: "Free daily quota reached. Resets at 5:30 AM IST. Browse the pre-made gallery meanwhile." });
  }

  const batchId = inputs.length > 1 ? crypto.randomUUID() : null;
  const options = { ...(typeof body.options === "object" && body.options ? body.options : {}), ipHash };
  const inserted = await db
    .from("jobs")
    .insert(inputs.map((input_text) => ({ input_type: inputType, input_text, batch_id: batchId, community_id: body.community_id ?? null, options })))
    .select("id");
  if (inserted.error) throw new Error(inserted.error.message);

  const jobs: Array<{ id: string; status: string; error?: string }> = [];
  for (const { id } of inserted.data) {
    try {
      await dispatchRender(id);
      jobs.push({ id, status: "queued" });
    } catch (err) {
      const error = (err as Error).message;
      await db.from("jobs").update({ status: "failed", error }).eq("id", id);
      jobs.push({ id, status: "failed", error });
    }
  }
  return res.status(jobs.some((j) => j.status === "queued") ? 201 : 502).json({ batch_id: batchId, jobs });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === "GET") return await getJob(req, res);
    if (req.method === "POST") return await createJobs(req, res);
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: (err as Error).message });
  }
}
