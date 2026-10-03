// Vercel function. Hands out signed upload URLs so the browser can upload images straight to Supabase Storage.
// The browser re-encodes images first (which removes EXIF and GPS); this function checks count, type and size.
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "node:crypto";

const MAX_FILES = 10;
const MAX_BYTES = 5 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
// One voiceover per batch: an uploaded file or a recording made in the browser.
const VOICE_TYPES: Record<string, string> = { "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/wav": "wav", "audio/x-wav": "wav", "audio/webm": "webm", "audio/ogg": "ogg" };
const MAX_VOICE_BYTES = 15 * 1024 * 1024;
const PER_IP_PER_HOUR = Number(process.env.MAX_UPLOAD_BATCHES_PER_IP_PER_HOUR ?? 6);

// Best-effort limit per warm instance. The job limit in /api/jobs is the real guard.
const recent = new Map<string, number[]>();

const env = (name: string) => {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const body = (typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body) ?? {};
    const files: Array<{ name?: unknown; type?: unknown; size?: unknown; kind?: unknown }> = Array.isArray(body.files) ? body.files : [];
    const voice = files.filter((f) => f.kind === "voice");
    const images = files.filter((f) => f.kind !== "voice");
    if (files.length === 0 || images.length > MAX_FILES || voice.length > 1) return res.status(400).json({ error: `Send up to ${MAX_FILES} images and at most one voiceover` });
    for (const f of images) {
      if (typeof f.type !== "string" || !TYPES[f.type]) return res.status(400).json({ error: "Only JPG, PNG or WebP images" });
      if (typeof f.size !== "number" || f.size <= 0 || f.size > MAX_BYTES) return res.status(400).json({ error: "Each image must be under 5 MB" });
    }
    for (const f of voice) {
      const base = typeof f.type === "string" ? f.type.split(";")[0] : "";
      if (!VOICE_TYPES[base]) return res.status(400).json({ error: "Voiceover must be MP3, M4A, WAV, WebM or OGG" });
      if (typeof f.size !== "number" || f.size <= 0 || f.size > MAX_VOICE_BYTES) return res.status(400).json({ error: "The voiceover must be under 15 MB" });
      f.type = base;
    }

    const ip = String(req.headers["x-forwarded-for"] ?? "unknown").split(",")[0].trim();
    const now = Date.now();
    const times = (recent.get(ip) ?? []).filter((t) => now - t < 3600_000);
    if (times.length >= PER_IP_PER_HOUR) return res.status(429).json({ error: "Too many uploads from this network. Try again in an hour." });
    recent.set(ip, [...times, now]);

    const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_KEY"), { auth: { persistSession: false } });
    const batch = crypto.randomUUID();
    const uploads = [];
    for (const [i, f] of files.entries()) {
      const path = f.kind === "voice" ? `uploads/${batch}/voice.${VOICE_TYPES[f.type as string]}` : `uploads/${batch}/${i + 1}.${TYPES[f.type as string]}`;
      const signed = await db.storage.from("videos").createSignedUploadUrl(path);
      if (signed.error) throw new Error(signed.error.message);
      uploads.push({ index: i + 1, kind: f.kind === "voice" ? "voice" : "image", path, token: signed.data.token, name: String(f.name ?? `file ${i + 1}`).slice(0, 80) });
    }
    return res.status(200).json({ batch, uploads });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: (err as Error).message });
  }
}
