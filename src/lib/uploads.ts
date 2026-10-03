import { supabase } from "./supabase";

export type Uploaded = { index: number; path: string; name: string; preview: string };

const MAX_SIDE = 2048;

// Re-encode in the browser: applies the EXIF rotation, removes EXIF and GPS, and caps the size.
async function clean(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not read image"))), "image/jpeg", 0.9));
}

export async function uploadImages(files: File[]): Promise<Uploaded[]> {
  const allowed = ["image/jpeg", "image/png", "image/webp"];
  for (const f of files) {
    if (!allowed.includes(f.type)) throw new Error(`${f.name}: only JPG, PNG or WebP`);
    if (f.size > 5 * 1024 * 1024) throw new Error(`${f.name}: must be under 5 MB`);
  }
  const blobs = await Promise.all(files.map(clean));
  const res = await fetch("/api/uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ files: blobs.map((b, i) => ({ name: files[i].name, type: "image/jpeg", size: b.size })) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Upload failed (${res.status})`);
  const out: Uploaded[] = [];
  for (const u of data.uploads as Array<{ index: number; path: string; token: string; name: string }>) {
    const { error } = await supabase.storage.from("videos").uploadToSignedUrl(u.path, u.token, blobs[u.index - 1], { contentType: "image/jpeg" });
    if (error) throw new Error(`${u.name}: ${error.message}`);
    out.push({ index: u.index, path: u.path, name: u.name, preview: URL.createObjectURL(blobs[u.index - 1]) });
  }
  return out;
}

export type UploadedVoice = { path: string; name: string; url: string; durationSec: number };

export async function audioDuration(blob: Blob): Promise<number> {
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise<number>((resolve) => {
      const a = new Audio();
      a.preload = "metadata";
      a.onloadedmetadata = () => {
        // Browser recordings report Infinity until seeked to the end.
        if (Number.isFinite(a.duration)) return resolve(a.duration);
        a.currentTime = 1e9;
        a.ontimeupdate = () => resolve(Number.isFinite(a.duration) ? a.duration : 0);
      };
      a.onerror = () => resolve(0);
      a.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function uploadVoice(blob: Blob, name: string): Promise<UploadedVoice> {
  const type = (blob.type || "audio/mpeg").split(";")[0];
  if (blob.size > 15 * 1024 * 1024) throw new Error("The voiceover must be under 15 MB");
  const durationSec = await audioDuration(blob);
  if (durationSec > 60) throw new Error(`The voiceover is ${Math.round(durationSec)} s. Keep it under 60 s (Qoneqt plays up to 45 s).`);
  const res = await fetch("/api/uploads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ files: [{ kind: "voice", name, type, size: blob.size }] }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Upload failed (${res.status})`);
  const u = data.uploads[0] as { path: string; token: string };
  const { error } = await supabase.storage.from("videos").uploadToSignedUrl(u.path, u.token, blob, { contentType: type });
  if (error) throw new Error(error.message);
  return { path: u.path, name, url: URL.createObjectURL(blob), durationSec };
}

export type UploadedVideo = { path: string; name: string; sizeMb: number; durationSec: number };

function videoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      resolve(Number.isFinite(v.duration) ? v.duration : 0);
      URL.revokeObjectURL(v.src);
    };
    v.onerror = () => resolve(0);
    v.src = URL.createObjectURL(file);
  });
}

// One source video for the Clipper, uploaded straight to storage with a signed URL.
export async function uploadVideo(file: File, maxMb: number): Promise<UploadedVideo> {
  const type = file.type || "video/mp4";
  if (file.size > maxMb * 1024 * 1024) throw new Error(`This file is ${Math.round(file.size / 1024 / 1024)} MB; the limit is ${maxMb} MB. Paste a link instead, or trim the video first.`);
  const durationSec = await videoDuration(file);
  const res = await fetch("/api/uploads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ files: [{ kind: "video", name: file.name, type, size: file.size }] }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Upload failed (${res.status})`);
  const u = data.uploads[0] as { path: string; token: string };
  const { error } = await supabase.storage.from("videos").uploadToSignedUrl(u.path, u.token, file, { contentType: type });
  if (error) throw new Error(error.message);
  return { path: u.path, name: file.name.slice(0, 80), sizeMb: Number((file.size / 1024 / 1024).toFixed(1)), durationSec };
}
