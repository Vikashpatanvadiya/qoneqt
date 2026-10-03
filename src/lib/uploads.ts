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
