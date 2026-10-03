import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Film, Link2, Scissors, Upload } from "lucide-react";
import { ApiError, createJobs } from "../lib/api";
import { uploadVideo, type UploadedVideo } from "../lib/uploads";
import { StylePicker } from "../components/StylePicker";
import { Button, Card, SectionTitle, cx } from "../components/ui";
import { CLIP_LENGTHS, type ClipLayout, type ClipLength } from "../../shared/clip";

const MAX_UPLOAD_MB = Number(import.meta.env.VITE_MAX_VIDEO_UPLOAD_MB ?? 50);

function Choice<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: Array<{ value: T; label: string; note?: string }>; onChange: (v: T) => void }) {
  return (
    <div>
      <span className="text-sm font-medium text-muted">{label}</span>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((o) => (
          <button key={String(o.value)} onClick={() => onChange(o.value)} aria-pressed={value === o.value} title={o.note} className={cx("rounded-xl px-3 py-1.5 text-sm font-semibold transition", value === o.value ? "bg-brand text-[#141414]" : "bg-white/[0.05] text-muted hover:text-ink")}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ClipperPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"url" | "upload">("url");
  const [url, setUrl] = useState("");
  const [video, setVideo] = useState<UploadedVideo | null>(null);
  const [uploading, setUploading] = useState(false);
  const [rights, setRights] = useState(false);
  const [layout, setLayout] = useState<ClipLayout>("auto");
  const [count, setCount] = useState(5);
  const [length, setLength] = useState<ClipLength>("medium");
  const [removePauses, setRemovePauses] = useState(true);
  const [captions, setCaptions] = useState(true);
  const [stylePack, setStylePack] = useState("auto");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(false);

  const validUrl = /^https?:\/\/\S{4,}$/.test(url.trim());
  const ready = rights && (mode === "url" ? validUrl : Boolean(video)) && !uploading;

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      setVideo(await uploadVideo(file, MAX_UPLOAD_MB));
    } catch (err) {
      setError((err as Error).message);
      setVideo(null);
    } finally {
      setUploading(false);
    }
  }

  async function start() {
    setError(null);
    setNeedLogin(false);
    setBusy(true);
    try {
      const source = mode === "url" ? { kind: "url", url: url.trim() } : { kind: "upload", path: video!.path, name: video!.name };
      const res = await createJobs({
        input_type: "video",
        inputs: [mode === "url" ? url.trim() : video!.name],
        options: { engine: "gemini", stylePack, clip: { source, layout, count, length, removePauses, captions, rightsConfirmed: true } },
      });
      const job = res.jobs.find((j) => j.status !== "failed");
      if (!job) throw new Error(res.jobs[0]?.error ?? "Could not start the job");
      navigate(`/jobs/${job.id}`);
    } catch (err) {
      setError((err as Error).message);
      setNeedLogin(err instanceof ApiError && err.needLogin);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-12">
      <section>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber">Clipper</p>
        <h1 className="mt-4 max-w-3xl text-[40px] font-semibold leading-[1.04] sm:text-5xl">
          One long video in. <span className="text-brand">The best moments out</span>, as ready-to-post shorts.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-muted">We transcribe it, an AI editor picks the moments that stand on their own, and each one becomes a vertical clip that follows the speaker, with pauses removed and captions in your style.</p>
      </section>

      <section>
        <SectionTitle>Your video</SectionTitle>
        <Card className="space-y-6">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Video source">
            {([
              { id: "url", label: "Paste a link", icon: <Link2 size={16} /> },
              { id: "upload", label: "Upload a file", icon: <Upload size={16} /> },
            ] as const).map((t) => (
              <button key={t.id} role="tab" aria-selected={mode === t.id} onClick={() => setMode(t.id)} className={cx("flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition", mode === t.id ? "bg-ink text-bg" : "bg-white/[0.05] text-muted hover:text-ink")}>
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>

          {mode === "url" ? (
            <div>
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" className="w-full rounded-2xl border border-line bg-surface px-4 py-3.5 text-[16px] text-ink placeholder:text-faint focus:border-amber/60 focus:outline-none" />
              <p className="mt-2 text-xs text-faint">YouTube and most public video links work, up to 90 minutes. YouTube sometimes blocks downloads from our servers; if that happens, upload the file instead.</p>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <label className={cx("flex cursor-pointer items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium hover:border-white/20", uploading && "pointer-events-none opacity-50")}>
                <Film size={16} /> {uploading ? "Uploading…" : video ? "Choose another file" : "Choose a video"}
                <input type="file" accept="video/mp4,video/quicktime,video/webm,video/x-matroska,video/x-m4v" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
              </label>
              {video ? <span className="text-sm text-muted">{video.name} · {video.sizeMb} MB{video.durationSec ? ` · ${Math.floor(video.durationSec / 60)}:${String(Math.round(video.durationSec % 60)).padStart(2, "0")}` : ""}</span> : <span className="text-xs text-faint">MP4, MOV, WebM or MKV, up to {MAX_UPLOAD_MB} MB. For longer videos, paste a link.</span>}
            </div>
          )}

          <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-amber/10 px-4 py-3 text-sm text-amber">
            <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#fda24a]" />
            <span>I own this video or have permission to use it. Clips may be posted publicly.</span>
          </label>

          <div className="grid gap-5 border-t border-line pt-5 md:grid-cols-2">
            <Choice label="Vertical layout" value={layout} onChange={setLayout} options={[{ value: "auto", label: "Auto", note: "Follows the face when there is one, blurred fill otherwise" }, { value: "face", label: "Follow the face" }, { value: "blur", label: "Blurred fill", note: "Whole frame on a blurred copy, good for screens and slides" }, { value: "split", label: "Split screen", note: "Speaker on top, background below" }]} />
            <Choice label="Clips" value={count} onChange={setCount} options={[3, 5, 8].map((n) => ({ value: n, label: String(n) }))} />
            <Choice label="Length of each clip" value={length} onChange={setLength} options={(Object.keys(CLIP_LENGTHS) as ClipLength[]).map((k) => ({ value: k, label: CLIP_LENGTHS[k].label }))} />
            <div className="flex flex-wrap items-end gap-6">
              <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={removePauses} onChange={(e) => setRemovePauses(e.target.checked)} className="h-4 w-4 accent-[#fda24a]" /> Remove pauses</label>
              <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={captions} onChange={(e) => setCaptions(e.target.checked)} className="h-4 w-4 accent-[#fda24a]" /> Captions</label>
            </div>
          </div>

          <StylePicker value={stylePack} onChange={setStylePack} allowClassic={false} autoNote="Auto: a different pack from your last video" />

          {error ? (
            <p className="rounded-xl bg-red/10 px-3 py-2 text-sm text-red">
              {error} {needLogin ? <Link to="/login" className="font-semibold underline">Log in</Link> : null}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
            <span className="text-xs text-faint">Takes about 5 to 15 minutes, longer for long videos. You can watch every step live.</span>
            <Button onClick={start} disabled={!ready || busy}>
              <Scissors size={18} /> {busy ? "Starting…" : `Make ${count} clips`} <ArrowRight size={18} />
            </Button>
          </div>
        </Card>
      </section>
    </div>
  );
}
