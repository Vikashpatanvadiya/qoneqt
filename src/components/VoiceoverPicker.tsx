import { useEffect, useRef, useState } from "react";
import { Mic, Square, Upload, X } from "lucide-react";
import { uploadVoice, type UploadedVoice } from "../lib/uploads";
import { cx } from "./ui";

const MAX_SEC = 60;

// Upload an audio file or record straight in the browser. The recording is uploaded when you stop.
export function VoiceoverPicker({ value, onChange, onError }: { value: UploadedVoice | null; onChange: (v: UploadedVoice | null) => void; onError: (msg: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearInterval(timer.current), []);

  async function send(blob: Blob, name: string) {
    setBusy(true);
    try {
      onChange(await uploadVoice(blob, name));
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const type = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
      const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        window.clearInterval(timer.current);
        setRecording(false);
        send(new Blob(chunks, { type: rec.mimeType || "audio/webm" }), "recording");
      };
      rec.start(250);
      recorder.current = rec;
      setElapsed(0);
      setRecording(true);
      const started = Date.now();
      timer.current = window.setInterval(() => {
        const s = (Date.now() - started) / 1000;
        setElapsed(s);
        if (s >= MAX_SEC) rec.stop();
      }, 200);
    } catch {
      onError("Could not use the microphone. Allow microphone access, or upload a file instead.");
    }
  }

  if (value) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface p-3">
        <audio src={value.url} controls className="h-9 max-w-full" />
        <span className={cx("text-xs", value.durationSec > 45 ? "text-amber" : "text-muted")}>
          {value.durationSec.toFixed(1)} s{value.durationSec > 45 ? " · over 45 s, the video will be flagged as too long" : ""}
        </span>
        <button onClick={() => onChange(null)} className="ml-auto rounded-full bg-white/[0.06] p-1.5" aria-label="Remove voiceover"><X size={14} /></button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {recording ? (
        <button onClick={() => recorder.current?.stop()} className="inline-flex items-center gap-2 rounded-xl bg-red px-4 py-2 text-sm font-semibold text-white">
          <Square size={14} /> Stop · {elapsed.toFixed(0)} s
        </button>
      ) : (
        <button onClick={startRecording} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold hover:border-white/20 disabled:opacity-50">
          <Mic size={14} /> Record
        </button>
      )}
      <label className={cx("inline-flex cursor-pointer items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold hover:border-white/20", (busy || recording) && "pointer-events-none opacity-50")}>
        <Upload size={14} /> {busy ? "Uploading…" : "Upload audio"}
        <input type="file" accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/webm,audio/ogg,.mp3,.m4a,.wav" className="sr-only" onChange={(e) => e.target.files?.[0] && send(e.target.files[0], e.target.files[0].name)} />
      </label>
      <span className="text-xs text-faint">MP3, M4A, WAV · up to 60 s · your words become the script and the captions</span>
    </div>
  );
}
