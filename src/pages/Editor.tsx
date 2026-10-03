import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Player, type PlayerRef } from "@remotion/player";
import { ArrowLeft, ArrowRight, ImagePlus, LayoutTemplate, RotateCcw, Sparkles, Trash2, Wand2 } from "lucide-react";
import { PulseVideo, sceneFrames, totalFrames } from "../../remotion/PulseVideo";
import { FPS, HEIGHT, WIDTH, type PulseVideoProps, type RenderScene } from "../../shared/types";
import { ApiError, createJobs } from "../lib/api";
import { supabase } from "../lib/supabase";
import { JOB_COLUMNS, type JobRow } from "../lib/types";
import { uploadImages } from "../lib/uploads";
import { Button, Card, Chip, Empty, SectionTitle, cx } from "../components/ui";

// One scene as the editor holds it: the original render data plus the creator's changes.
type EditScene = {
  source: RenderScene;
  onScreenText: string;
  narration: string;
  card: boolean; // turned into a designed card
  upload?: { path: string; url: string };
  prompt?: string; // generate a new image at render time
};

const storage = (path: string) => `${import.meta.env.VITE_SUPABASE_URL?.replace(/\/+$/, "").replace(/\/rest\/v1$/, "")}/storage/v1/object/public/videos/${path}`;

export function EditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const player = useRef<PlayerRef>(null);
  const [job, setJob] = useState<JobRow | null>(null);
  const [base, setBase] = useState<PulseVideoProps | null>(null);
  const [scenes, setScenes] = useState<EditScene[]>([]);
  const [selected, setSelected] = useState(0);
  const [missing, setMissing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const j = await supabase.from("jobs").select(JOB_COLUMNS).eq("id", id!).maybeSingle();
      if (!j.data) return setMissing("This video does not exist.");
      setJob(j.data as JobRow);
      const res = await fetch(storage(`${id}/edit/props.json`));
      if (!res.ok) return setMissing("This video was made before editing was added. Make a new video to edit it here.");
      const props = (await res.json()) as PulseVideoProps;
      setBase(props);
      setScenes(props.scenes.map((s) => ({ source: s, onScreenText: s.onScreenText, narration: s.narration, card: false })));
    })();
  }, [id]);

  const voiceLocked = Boolean(job?.options?.voiceover);

  // What the browser preview shows: text, order, cuts, cards and uploaded images update instantly.
  const preview = useMemo<PulseVideoProps | null>(() => {
    if (!base) return null;
    return {
      ...base,
      assetBase: storage(`${id}/edit/`),
      scenes: scenes.map((e) => ({
        ...e.source,
        onScreenText: e.onScreenText,
        titleFontSize: e.onScreenText === e.source.onScreenText ? e.source.titleFontSize : undefined,
        ...(e.card ? { layout: "text_card" as const, imageFile: null } : {}),
        ...(e.upload ? { layout: "full_image" as const, imageFile: e.upload.url } : {}),
      })),
    };
  }, [base, scenes, id]);

  const starts = useMemo(() => {
    let c = 0;
    return (preview?.scenes ?? []).map((s) => {
      const f = c;
      c += sceneFrames(s);
      return f;
    });
  }, [preview]);

  const select = (i: number) => {
    setSelected(i);
    player.current?.seekTo(starts[i] ?? 0);
  };
  const update = (i: number, patch: Partial<EditScene>) => setScenes((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= scenes.length) return;
    setScenes((prev) => {
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setSelected(j);
  };
  const remove = (i: number) => {
    if (scenes.length <= 2) return setError("Keep at least two scenes.");
    setScenes((prev) => prev.filter((_, j) => j !== i));
    setSelected(Math.max(0, i - 1));
  };

  async function replaceImage(i: number, file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const [u] = await uploadImages([file]);
      update(i, { upload: { path: u.path, url: storage(u.path) }, prompt: undefined, card: false });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const changed = scenes.some((s) => s.onScreenText !== s.source.onScreenText || s.narration !== s.source.narration || s.card || s.upload || s.prompt) || scenes.length !== (base?.scenes.length ?? 0) || scenes.some((s, i) => s.source.id !== base?.scenes[i]?.id);

  async function render() {
    if (!job) return;
    setBusy(true);
    setError(null);
    try {
      const edits = scenes.map((e) => ({
        id: e.source.id,
        onScreenText: e.onScreenText.trim(),
        ...(e.narration.trim() !== e.source.narration && !voiceLocked ? { narration: e.narration.trim() } : {}),
        ...(e.card ? { layout: "text_card" } : {}),
        ...(e.upload ? { image: { upload: e.upload.path } } : e.prompt?.trim() ? { image: { prompt: e.prompt.trim() } } : {}),
      }));
      const res = await createJobs({ input_type: job.input_type, inputs: [job.input_text], options: { edit: { fromJob: job.id, scenes: edits } } });
      const ok = res.jobs.find((j) => j.status !== "failed");
      if (!ok) throw new Error(res.jobs[0]?.error ?? "Could not start the render");
      navigate(`/jobs/${ok.id}`);
    } catch (err) {
      setError(err instanceof ApiError && err.needLogin ? `${err.message}` : (err as Error).message);
      setBusy(false);
    }
  }

  if (missing) return <Empty>{missing} <Link to={`/jobs/${id}`} className="text-amber">Back to the video</Link></Empty>;
  if (!preview || !job) return <div className="h-40 animate-pulse rounded-3xl bg-card" />;
  const cur = scenes[selected];

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-end gap-4">
        <div>
          <Link to={`/jobs/${id}`} className="text-sm text-muted hover:text-ink">← Back to the video</Link>
          <h1 className="mt-2 text-4xl font-semibold">Edit: {job.title}</h1>
          <p className="mt-2 text-muted">Cut, reorder, change text and swap images. Text, order, cuts and new uploads show in the preview right away; new narration and generated images appear after the render.</p>
        </div>
        <Button onClick={render} disabled={busy || !changed} className="ml-auto">
          <Wand2 size={18} /> {busy ? "Starting…" : "Render edited version"}
        </Button>
      </section>
      {error ? <p className="rounded-2xl bg-red/10 px-4 py-3 text-sm text-red">{error}</p> : null}

      <div className="grid gap-8 lg:grid-cols-[360px_1fr]">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <div className="overflow-hidden rounded-3xl border border-white/[0.06] bg-black">
            <Player
              ref={player}
              component={PulseVideo}
              inputProps={preview}
              durationInFrames={Math.max(FPS, totalFrames(preview.scenes))}
              compositionWidth={WIDTH}
              compositionHeight={HEIGHT}
              fps={FPS}
              controls
              acknowledgeRemotionLicense
              style={{ width: "100%", aspectRatio: "9 / 16" }}
            />
          </div>
          <p className="mt-2 text-xs text-faint">Preview in the browser. The final render runs on the server.</p>
        </div>

        <div className="space-y-6">
          <div>
            <SectionTitle>Scenes</SectionTitle>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {scenes.map((s, i) => {
                const img = s.card ? null : s.upload?.url ?? (s.source.layout === "full_image" && s.source.imageFile ? storage(`${id}/edit/${s.source.imageFile}`) : null);
                return (
                  <button key={s.source.id} onClick={() => select(i)} className={cx("w-24 shrink-0 overflow-hidden rounded-2xl border text-left transition", i === selected ? "border-amber" : "border-white/[0.06] hover:border-white/20")}>
                    <div className="flex aspect-[9/16] items-center justify-center bg-surface p-2 text-center text-[10px] font-semibold uppercase leading-tight text-muted">
                      {img ? <img src={img} alt="" className="h-full w-full object-cover" /> : s.onScreenText}
                    </div>
                    <div className="px-2 py-1.5 text-[11px]">
                      <span className="font-semibold">{i + 1}</span> <span className="text-faint">{s.source.durationSec.toFixed(1)}s</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {cur ? (
            <Card className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display text-xl font-semibold">Scene {selected + 1}</span>
                {cur.source.purpose ? <Chip>{cur.source.purpose}</Chip> : null}
                <div className="ml-auto flex gap-1.5">
                  <button onClick={() => move(selected, -1)} disabled={selected === 0} className="rounded-xl border border-line p-2 disabled:opacity-30" aria-label="Move earlier"><ArrowLeft size={16} /></button>
                  <button onClick={() => move(selected, 1)} disabled={selected === scenes.length - 1} className="rounded-xl border border-line p-2 disabled:opacity-30" aria-label="Move later"><ArrowRight size={16} /></button>
                  <button onClick={() => remove(selected)} className="rounded-xl border border-red/30 p-2 text-red" aria-label="Cut this scene"><Trash2 size={16} /></button>
                </div>
              </div>

              <label className="block">
                <span className="text-sm font-medium text-muted">On-screen text</span>
                <input value={cur.onScreenText} maxLength={60} onChange={(e) => update(selected, { onScreenText: e.target.value })} className="mt-2 w-full rounded-2xl border border-line bg-surface px-4 py-3 text-ink focus:border-amber/60 focus:outline-none" />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-muted">Narration (the spoken line and the captions)</span>
                <textarea
                  value={cur.narration}
                  disabled={voiceLocked}
                  rows={3}
                  maxLength={300}
                  onChange={(e) => update(selected, { narration: e.target.value })}
                  className="mt-2 w-full resize-y rounded-2xl border border-line bg-surface px-4 py-3 text-ink focus:border-amber/60 focus:outline-none disabled:opacity-60"
                />
                <span className="mt-1 block text-xs text-faint">
                  {voiceLocked ? "This video uses your own voiceover, so the spoken words can't be changed here." : cur.narration !== cur.source.narration ? "This line will be re-voiced and re-captioned when you render." : "Change the words and this line is re-voiced on render."}
                </span>
              </label>

              <div className="space-y-3">
                <span className="text-sm font-medium text-muted">Picture</span>
                <div className="flex flex-wrap gap-2">
                  <label className={cx("inline-flex cursor-pointer items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-semibold hover:border-white/20", busy && "pointer-events-none opacity-50")}>
                    <ImagePlus size={15} /> Upload image
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => replaceImage(selected, e.target.files?.[0])} />
                  </label>
                  <button onClick={() => update(selected, { card: true, upload: undefined, prompt: undefined })} className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-semibold hover:border-white/20">
                    <LayoutTemplate size={15} /> Use a text card
                  </button>
                  {cur.card || cur.upload || cur.prompt ? (
                    <button onClick={() => update(selected, { card: false, upload: undefined, prompt: undefined })} className="inline-flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm font-semibold text-muted hover:text-ink">
                      <RotateCcw size={15} /> Original
                    </button>
                  ) : null}
                </div>
                <label className="block">
                  <span className="flex items-center gap-1.5 text-xs text-muted"><Sparkles size={13} /> Or describe a new AI image (made when you render)</span>
                  <input
                    value={cur.prompt ?? ""}
                    placeholder="a steel tiffin and a phone on a hostel desk, evening light"
                    onChange={(e) => update(selected, { prompt: e.target.value, upload: undefined, card: false })}
                    className="mt-2 w-full rounded-2xl border border-line bg-surface px-4 py-2.5 text-sm text-ink placeholder:text-faint focus:border-amber/60 focus:outline-none"
                  />
                </label>
                <p className="text-xs text-faint">Only upload images you have the right to use. The video may be public.</p>
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
