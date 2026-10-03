import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ChevronDown, Copy, Download, ExternalLink, Film, Send, Timer, Trash2 } from "lucide-react";
import { deleteJob } from "../lib/api";
import { useAuth } from "../lib/auth";
import { ago, score, seconds, stageMs } from "../lib/format";
import { EXPECTED_STAGES, STAGE_INFO } from "../lib/stages";
import { supabase } from "../lib/supabase";
import { JOB_COLUMNS, type JobRow, type StageRow, type StageStatus } from "../lib/types";
import { Card, Chip, Empty, SectionTitle, StatusPill, cx } from "../components/ui";

const POLL_MS = 2500;

export function JobPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { session } = useAuth();
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [job, setJob] = useState<JobRow | null>(null);
  const [stages, setStages] = useState<StageRow[]>([]);
  const [missing, setMissing] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let stop = false;
    let timer: number | undefined;
    const load = async () => {
      const [j, s] = await Promise.all([
        supabase.from("jobs").select(JOB_COLUMNS).eq("id", id!).maybeSingle(),
        supabase.from("stages").select("*").eq("job_id", id!).order("seq"),
      ]);
      if (stop) return;
      if (!j.data && !j.error) setMissing(true);
      if (j.data) setJob(j.data as JobRow);
      if (s.data) setStages(s.data as StageRow[]);
      setNow(Date.now());
      const status = (j.data as JobRow | null)?.status;
      if (status !== "done" && status !== "failed") timer = window.setTimeout(load, POLL_MS);
    };
    load();
    return () => {
      stop = true;
      window.clearTimeout(timer);
    };
  }, [id]);

  // Keep running timers ticking between polls.
  useEffect(() => {
    if (job?.status === "done" || job?.status === "failed") return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [job?.status]);

  const byName = useMemo(() => new Map(stages.map((s) => [s.name, s])), [stages]);
  const engine = (job?.options?.engine as string) ?? "gemini";
  const usedPlanner = byName.has("plan") && byName.get("plan")!.status !== "skipped";
  const order = useMemo(() => {
    const expected = EXPECTED_STAGES[engine === "pulse-lm" && (usedPlanner || !byName.has("research")) ? "pulse-lm" : "gemini"];
    const seen = stages.map((s) => s.name);
    return [...seen, ...expected.filter((n) => !seen.includes(n))];
  }, [stages, engine, usedPlanner, byName]);

  if (missing) return <Empty>This job does not exist. <Link to="/" className="text-amber">Create a video</Link></Empty>;
  if (!job) return <div className="h-40 animate-pulse rounded-3xl bg-card" />;

  const totalMs = job.metrics?.total_ms ?? (job.status === "done" || job.status === "failed" ? null : now - Date.parse(job.created_at));
  const critic = byName.get("script_critic")?.output;
  const scriptVersions: any[] = critic?.versions?.length ? critic.versions : (byName.get("script")?.output?.versions ?? byName.get("plan")?.output?.versions ?? []);
  const vision = byName.get("vision_critic")?.output;
  const qaChecks: any[] = byName.get("qa")?.output?.checks ?? [];
  const community = byName.get("ingest")?.output?.community?.name ?? "Qoneqt Global Feed";
  const caption = scriptVersions.at(-1)?.script?.caption ?? scriptVersions[0]?.script?.caption;
  const isOwner = Boolean(session && job.user_id && session.user.id === job.user_id);
  const finished = job.status === "done" || job.status === "failed";

  async function remove() {
    if (!window.confirm("Delete this video, its frames and its record? This cannot be undone.")) return;
    setDeleting(true);
    setActionError(null);
    try {
      await deleteJob(job!.id);
      navigate("/library?mine=1");
    } catch (err) {
      setActionError((err as Error).message);
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-14">
      <section>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <StatusPill status={job.status === "done" ? "done" : job.status === "failed" ? "failed" : job.status === "running" ? "running" : "queued"} />
          <Chip>{job.input_type}</Chip>
          <Chip>{community}</Chip>
          <Chip tone={engine === "pulse-lm" ? "accent" : "plain"}>{engine === "pulse-lm" ? "Pulse-LM" : "Cloud Gemini"}</Chip>
          <span className="ml-1">{ago(job.created_at)}</span>
        </div>
        <h1 className="mt-4 text-4xl font-semibold leading-tight sm:text-5xl">{job.title ?? "Working on it…"}</h1>
        <p className="mt-3 line-clamp-3 max-w-3xl whitespace-pre-line text-muted">{job.input_text}</p>
        {job.status === "failed" ? <p className="mt-4 rounded-2xl bg-red/10 px-4 py-3 text-sm text-red">{friendlyError(job.error)}</p> : null}
      </section>

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <section>
          <SectionTitle>Agent timeline</SectionTitle>
          <ol className="space-y-3">
            {order.map((name, i) => (
              <StageCard key={name} index={i + 1} name={name} stage={byName.get(name)} now={now} jobDone={job.status === "done" || job.status === "failed"} />
            ))}
          </ol>
        </section>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card className="p-4 sm:p-4">
            {job.video_url ? (
              <video src={job.video_url} poster={job.thumb_url ?? undefined} controls playsInline className="aspect-[9/16] w-full rounded-2xl bg-black" />
            ) : (
              <div className="flex aspect-[9/16] w-full flex-col items-center justify-center gap-3 rounded-2xl bg-surface px-6 text-center">
                <Film className={cx("text-faint", job.status !== "failed" && "animate-pulse")} size={36} />
                <p className="text-sm text-muted">{job.status === "failed" ? "No video for this job." : "Your video appears here when it is ready. This usually takes 3 to 6 minutes."}</p>
              </div>
            )}
            {job.video_url ? (
              <div className="mt-3 flex gap-2">
                <a href={`${job.video_url}?download=${encodeURIComponent((job.title ?? "pulse-video").replace(/[^\w-]+/g, "-"))}.mp4`} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-[#141414]">
                  <Download size={16} /> Download
                </a>
                {caption ? (
                  <button onClick={() => navigator.clipboard?.writeText(caption)} className="inline-flex items-center gap-2 rounded-xl border border-line px-4 py-2.5 text-sm font-semibold">
                    <Copy size={16} /> Caption
                  </button>
                ) : null}
              </div>
            ) : null}
          </Card>
          {job.video_url ? <PostToQoneqt videoUrl={job.video_url} title={job.title} caption={caption} /> : null}
          {isOwner && finished ? (
            <button onClick={remove} disabled={deleting} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red/30 px-4 py-2.5 text-sm font-semibold text-red hover:bg-red/10 disabled:opacity-50">
              <Trash2 size={16} /> {deleting ? "Deleting…" : "Delete this video"}
            </button>
          ) : null}
          {actionError ? <p className="rounded-xl bg-red/10 px-3 py-2 text-sm text-red">{actionError}</p> : null}
          <Card className="space-y-3 p-5 text-sm sm:p-5">
            <div className="flex items-center gap-2 font-semibold"><Timer size={16} className="text-amber" /> Time and cost</div>
            <Row k="Total time" v={seconds(totalMs)} />
            <Row k="Video length" v={job.duration_sec ? `${Number(job.duration_sec).toFixed(1)}s` : "–"} />
            <Row k="Script score" v={job.scores?.script_v1 != null ? `${score(job.scores.script_v1)} → ${score(job.scores.script_final)}` : "–"} />
            <Row k="Vision score" v={score(job.scores?.vision_avg)} />
            <Row k="LLM calls" v={job.metrics?.llm_calls ?? "–"} />
            <Row k="Images generated" v={job.metrics?.images ?? "–"} />
            <Row k="Fixed on its own" v={job.metrics?.fixes ?? "–"} />
            <Row k="Cost" v="₹0 on free tiers" />
          </Card>
        </aside>
      </div>

      {scriptVersions.length ? <ScriptVersions versions={scriptVersions} thresholds={critic?.thresholds} /> : null}
      {vision?.scenes?.length ? <Storyboard vision={vision} /> : null}
      {qaChecks.length ? <QaTable checks={qaChecks} /> : null}
    </div>
  );
}

// Qoneqt has no public posting API, so this hands the creator everything for the upload page in three steps.
function PostToQoneqt({ videoUrl, title, caption }: { videoUrl: string; title: string | null; caption?: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const file = `${(title ?? "pulse-video").replace(/[^\w-]+/g, "-")}.mp4`;
  return (
    <Card className="p-4 sm:p-4">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 text-sm font-semibold" aria-expanded={open}>
        <Send size={16} className="text-amber" /> Post on Qoneqt
        <ChevronDown size={16} className={cx("ml-auto text-faint transition", open && "rotate-180")} />
      </button>
      {open ? (
        <ol className="mt-4 space-y-3 text-sm">
          <li className="flex items-center gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-xs font-semibold">1</span>
            <a href={`${videoUrl}?download=${encodeURIComponent(file)}`} className="inline-flex items-center gap-1.5 font-semibold text-amber"><Download size={14} /> Download the video</a>
          </li>
          {caption ? (
            <li className="flex items-center gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-xs font-semibold">2</span>
              <button
                onClick={() => navigator.clipboard?.writeText(caption).then(() => setCopied(true))}
                className="inline-flex items-center gap-1.5 font-semibold text-amber"
              >
                <Copy size={14} /> {copied ? "Caption copied" : "Copy the caption"}
              </button>
            </li>
          ) : null}
          <li className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-xs font-semibold">{caption ? 3 : 2}</span>
            <span>
              <a href="https://qoneqt.com/create" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-amber">Open Qoneqt Create <ExternalLink size={14} /></a>
              <span className="mt-1 block text-xs text-muted">Choose Create Qlip, then Video, select the downloaded file and paste the caption. Qoneqt takes MP4 up to 45 s; this video fits.</span>
            </span>
          </li>
        </ol>
      ) : null}
    </Card>
  );
}

function friendlyError(error: string | null) {
  if (!error) return "Something went wrong.";
  if (/quota|429|rate/i.test(error)) return "Free daily quota reached. Resets at 5:30 AM IST. Browse the gallery in the Library meanwhile.";
  return error;
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted">{k}</span>
      <span className="font-medium tabular-nums">{v}</span>
    </div>
  );
}

function StageCard({ index, name, stage, now, jobDone }: { index: number; name: string; stage?: StageRow; now: number; jobDone: boolean }) {
  const [open, setOpen] = useState(false);
  const info = STAGE_INFO[name] ?? { title: name, agent: "", blurb: "" };
  const status: StageStatus = stage?.status ?? "pending";
  const ms = stage ? stageMs(stage.started_at, stage.ended_at, now) : null;
  const attempts: any[] = stage?.output?.attempts ?? [];
  const hasDetail = Boolean(stage?.output) && status !== "running";

  return (
    <li className={cx("rounded-3xl border bg-card transition", status === "running" ? "border-peach/40" : "border-white/[0.04]", !stage && jobDone && "opacity-40")}>
      <button className="flex w-full items-start gap-4 p-4 text-left sm:p-5" onClick={() => hasDetail && setOpen(!open)} aria-expanded={open}>
        <span className={cx("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-display text-sm font-semibold", status === "pending" ? "bg-white/[0.05] text-faint" : "bg-brand text-[#141414]")}>{index}</span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-display text-lg font-semibold">{info.title}</span>
            <span className="text-xs text-faint">{info.agent}</span>
            <span className="ml-auto flex items-center gap-2">
              {ms !== null ? <span className="text-xs tabular-nums text-muted">{seconds(ms)}</span> : null}
              <StatusPill status={status} />
            </span>
          </span>
          <span className="mt-1.5 block text-[15px] leading-snug text-ink/90">{stage?.summary ?? info.blurb}</span>
          {stage?.reason ? <span className="mt-1 block text-sm leading-snug text-muted">{stage.reason}</span> : null}
          {attempts.length ? (
            <span className="mt-2 flex flex-wrap gap-1.5">
              {[...new Set(attempts.map((a) => a.model))].map((m) => <Chip key={m}>{m.replace("hf.co/", "")}</Chip>)}
              {attempts.some((a) => !a.ok) ? <Chip tone="bad">{attempts.filter((a) => !a.ok).length} retried</Chip> : null}
              {attempts.some((a) => a.quota === "day") ? <Chip tone="bad">daily quota hit, switched model</Chip> : null}
            </span>
          ) : null}
        </span>
        {hasDetail ? <ChevronDown size={18} className={cx("mt-1.5 shrink-0 text-faint transition", open && "rotate-180")} /> : null}
      </button>
      {open && stage ? <div className="border-t border-line px-4 pb-5 pt-4 sm:px-5">{<StageDetail name={name} output={stage.output} />}</div> : null}
    </li>
  );
}

function StageDetail({ name, output }: { name: string; output: any }) {
  if (name === "research" && output?.research) {
    const r = output.research;
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted">{r.summary}</p>
        <div className="grid gap-2 md:grid-cols-3">
          {r.angles.map((a: any, i: number) => (
            <div key={i} className={cx("rounded-2xl border p-3 text-sm", i === r.chosenIndex ? "border-amber/60 bg-amber/[0.06]" : "border-line")}>
              <div className="flex items-center justify-between gap-2"><span className="font-semibold">{a.title}</span>{i === r.chosenIndex ? <Chip tone="accent">chosen</Chip> : null}</div>
              <p className="mt-1.5 text-muted">“{a.hookIdea}”</p>
              <p className="mt-1.5 text-xs text-faint">{a.targetEmotion} · {a.whyItWorks}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if ((name === "script" || name === "plan") && output?.versions?.[0]) return <ScenesList script={output.versions[0].script} />;
  if (name === "direct" && output?.plan) {
    const p = output.plan;
    return (
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          {p.global.palette.map((c: string) => <span key={c} className="h-6 w-6 rounded-full border border-white/10" style={{ background: c }} title={c} />)}
          {p.global.theme ? <Chip tone="accent">{p.global.theme} theme</Chip> : null}
          <Chip>{p.global.musicMood} music</Chip>
        </div>
        <p className="text-muted">{p.global.stylePrompt}</p>
        <div className="space-y-1.5">
          {p.shots.map((s: any) => (
            <div key={s.sceneId} className="flex flex-wrap items-center gap-1.5">
              <span className="w-8 font-semibold">{s.sceneId}</span>
              <Chip tone={s.layout === "full_image" ? "accent" : "plain"}>{s.layout.replace("_", " ")}</Chip>
              <Chip>{s.camera.replace("_", " ")}</Chip>
              <Chip>{s.transition}</Chip>
              <Chip>{s.captionStyle} captions</Chip>
              {s.visualPrompt ? <span className="w-full pl-9 text-xs text-faint">{s.visualPrompt}</span> : null}
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (name === "assets" && output?.governor) {
    const g = output.governor;
    return (
      <div className="space-y-2 text-sm text-muted">
        <p>Voice measured at {Number(g.measuredSec).toFixed(1)}s, final {Number(g.finalSec).toFixed(1)}s, budget {Number(g.budgetSec).toFixed(1)}s (limit {g.limitSec}s with the outro).{output.trimmedSilenceSec ? ` Trimmed ${output.trimmedSilenceSec}s of dead air.` : ""}</p>
        {g.actions?.map((a: any, i: number) => <p key={i}>• {a.detail}</p>)}
        {output.uploads?.length ? (
          <div className="flex flex-wrap gap-3 pt-2">
            {output.uploads.map((u: any) => (
              <figure key={u.sceneId} className="w-24 text-xs">
                <img src={u.url} alt={u.name} className="aspect-[3/4] w-24 rounded-lg object-cover" loading="lazy" />
                <figcaption className="mt-1 text-ink">{u.sceneId} ← [img{u.index}]</figcaption>
                <span className="text-faint">{u.how === "tag" ? "placed by tag" : "matched by meaning"}</span>
              </figure>
            ))}
          </div>
        ) : null}
      </div>
    );
  }
  if (name === "script_critic" && output?.versions?.length) return <p className="text-sm text-muted">Scores for every version are in Script versions below.</p>;
  if (name === "vision_critic" && output?.scenes) return <p className="text-sm text-muted">Every frame the critic looked at is in the Storyboard below.</p>;
  if (name === "qa" && output?.checks) return <p className="text-sm text-muted">All checks are listed in QA below.</p>;
  const attempts: any[] = output?.attempts ?? [];
  return attempts.length ? (
    <div className="space-y-1 text-xs text-muted">
      {attempts.map((a, i) => <div key={i}>{a.ok ? "✓" : "✗"} {a.model} · {a.status || "timeout"} · {seconds(a.ms)}{a.error ? ` · ${a.error}` : ""}</div>)}
    </div>
  ) : <p className="text-sm text-muted">No extra details.</p>;
}

function ScenesList({ script }: { script: any }) {
  return (
    <div className="space-y-2 text-sm">
      {script.scenes.map((s: any) => (
        <div key={s.id} className="grid grid-cols-[2.5rem_1fr] gap-2">
          <span className="font-semibold text-muted">{s.id}</span>
          <span>
            <span className="mr-2 text-xs uppercase tracking-wide text-amber">{s.purpose}</span>
            <span className="font-semibold">{s.onScreenText}</span>
            <span className="block text-muted">{s.narration}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

const SCORE_KEYS = [["hook", "Hook"], ["clarity", "Clarity"], ["pacing", "Pacing"], ["communityFit", "Community fit"], ["retention", "Retention"]] as const;

function ScriptVersions({ versions, thresholds }: { versions: any[]; thresholds?: { minOverall: number; minHook: number } }) {
  const first = versions[0];
  const final = versions.reduce((a, b) => ((b.overall ?? 0) >= (a.overall ?? 0) ? b : a), versions[0]);
  return (
    <section>
      <SectionTitle>Script versions</SectionTitle>
      {versions.length > 1 ? (
        <div className="mb-4 grid gap-4 md:grid-cols-2">
          {[first, final].map((v, i) => (
            <Card key={i} className={cx(i === 1 && "border-amber/40")}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-muted">{i === 0 ? "First draft" : `Final, v${v.version}`}</span>
                <span className="font-display text-3xl font-semibold">{score(v.overall)}</span>
              </div>
              <p className="mt-3 font-display text-xl font-semibold leading-snug">“{v.script.hook}”</p>
            </Card>
          ))}
        </div>
      ) : null}
      <Card className="overflow-x-auto p-0 sm:p-0">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="text-left text-muted">
              <th className="px-5 py-4 font-medium">Version</th>
              {SCORE_KEYS.map(([, l]) => <th key={l} className="px-3 py-4 font-medium">{l}</th>)}
              <th className="px-5 py-4 font-medium">Overall</th>
            </tr>
          </thead>
          <tbody>
            {versions.map((v) => (
              <tr key={v.version} className="border-t border-line">
                <td className="px-5 py-3.5 font-semibold">v{v.version} {v.passed ? <Chip tone="good">passed</Chip> : null}</td>
                {SCORE_KEYS.map(([k]) => <td key={k} className="px-3 py-3.5 tabular-nums">{v.critique?.scores?.[k] ?? "–"}</td>)}
                <td className="px-5 py-3.5 font-display text-lg font-semibold tabular-nums">{score(v.overall)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {thresholds ? <p className="border-t border-line px-5 py-3 text-xs text-faint">Pass mark: {thresholds.minOverall} overall and {thresholds.minHook} for the hook. The critic advises, code applies the bar.</p> : null}
      </Card>
      {first?.critique?.issues?.length && versions.length > 1 ? (
        <Card className="mt-4">
          <div className="mb-3 text-sm font-semibold text-muted">What the critic asked to fix in the first draft</div>
          <ul className="space-y-2 text-sm">
            {first.critique.issues.map((iss: any, i: number) => (
              <li key={i}><span className="font-semibold">{iss.sceneId}:</span> {iss.problem} <span className="text-muted">→ {iss.fix}</span></li>
            ))}
          </ul>
        </Card>
      ) : null}
    </section>
  );
}

function Storyboard({ vision }: { vision: any }) {
  const scenes: any[] = vision.scenes;
  const fixed = scenes.filter((s) => s.fix === "regenerated" || s.fix === "template");
  return (
    <section className="space-y-10">
      <div>
        <SectionTitle>Storyboard</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {scenes.map((s) => {
            const last = [...s.rounds].reverse().find((r: any) => r.stillUrl);
            const review = [...s.rounds].reverse().find((r: any) => r.review)?.review;
            return (
              <figure key={s.sceneId} className="overflow-hidden rounded-2xl border border-white/[0.04] bg-card">
                <img src={s.afterUrl ?? last?.stillUrl} alt={`Scene ${s.sceneId}`} className="aspect-[9/16] w-full object-cover" loading="lazy" />
                <figcaption className="flex items-center justify-between px-3 py-2 text-xs">
                  <span className="font-semibold">{s.sceneId}</span>
                  <span className="text-muted">{review ? `${review.score}/10` : "not checked"}</span>
                </figcaption>
              </figure>
            );
          })}
        </div>
        {vision.deliberatelyBroken ? <p className="mt-3 text-xs text-faint">Test run: scene {vision.deliberatelyBroken} was broken on purpose to show the Vision Critic at work.</p> : null}
      </div>
      {fixed.length ? (
        <div>
          <SectionTitle>Vision Critic: before and after</SectionTitle>
          <div className="space-y-4">
            {fixed.map((s) => (
              <Card key={s.sceneId}>
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <span className="font-display text-xl font-semibold">Scene {s.sceneId}</span>
                  <Chip tone="accent">{s.fix === "regenerated" ? "image regenerated" : "switched to a designed card"}</Chip>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-1">
                  {s.rounds.map((r: any) => (
                    <figure key={r.round} className="w-40 shrink-0 sm:w-48">
                      <img src={r.stillUrl} alt={`Scene ${s.sceneId}, round ${r.round}`} className="aspect-[9/16] w-full rounded-xl object-cover" loading="lazy" />
                      <figcaption className="mt-2 text-xs leading-snug">
                        <span className="font-semibold">Round {r.round}: {r.review ? `${r.review.score}/10` : "skipped"}</span>
                        {r.review?.looksAiGenerated ? <span className="block text-amber">AI look</span> : null}
                        {r.review ? <span className="block text-muted">{r.review.notes}</span> : null}
                      </figcaption>
                    </figure>
                  ))}
                  {s.afterUrl && s.fix === "template" ? (
                    <figure className="w-40 shrink-0 sm:w-48">
                      <img src={s.afterUrl} alt={`Scene ${s.sceneId} after`} className="aspect-[9/16] w-full rounded-xl object-cover" loading="lazy" />
                      <figcaption className="mt-2 text-xs font-semibold">After</figcaption>
                    </figure>
                  ) : null}
                </div>
              </Card>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function QaTable({ checks }: { checks: any[] }) {
  return (
    <section>
      <SectionTitle>QA gate</SectionTitle>
      <Card className="divide-y divide-line p-0 sm:p-0">
        {checks.map((c) => (
          <div key={c.id} className="flex flex-col gap-1 px-5 py-3.5 text-sm sm:flex-row sm:items-center sm:gap-4">
            <span className="w-44 shrink-0 font-semibold">{c.label}</span>
            <span className="flex-1 text-muted">{c.detail}{c.before ? <span className="text-faint"> ({c.before} → {c.after})</span> : null}</span>
            <span className="shrink-0"><StatusPill status={c.status === "pass" ? "done" : c.status === "fixed" ? "fixed" : "failed"} /></span>
          </div>
        ))}
      </Card>
    </section>
  );
}
