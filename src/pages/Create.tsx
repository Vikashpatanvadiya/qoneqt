import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Cpu, Layers, SlidersHorizontal, Sparkles } from "lucide-react";
import { createJobs } from "../lib/api";
import { supabase } from "../lib/supabase";
import { JOB_COLUMNS, type CommunityRow, type JobRow } from "../lib/types";
import { Button, Card, SectionTitle, cx } from "../components/ui";

const TYPES = [
  { id: "topic", label: "Topic", placeholder: "Why nobody replies in group chats anymore" },
  { id: "trend", label: "Trend", placeholder: "Everyone on campus is posting their 'day in my life' with a 7 AM alarm" },
  { id: "thread", label: "Community thread", placeholder: "Paste a thread: the title, then the replies.\n\nRiya: My friends dropped out and earn more than me...\nArjun: Survivorship bias. For every one who made it..." },
  { id: "idea", label: "Idea", placeholder: "A video roasting how every startup pitch says 'Uber for X'" },
] as const;

const SAMPLES: Record<string, string[]> = {
  topic: ["Why your first salary disappears by the 20th", "The gym is not judging you", "Tier 3 college placements, honestly"],
  trend: ["Everyone is quitting their jobs to 'build in public'", "Group projects where one person does everything"],
  thread: [
    `Is a college degree still worth it in 2026?\nRiya: Three friends dropped out, learned to code online and earn more than me. I have a degree and a loan.\nArjun: Survivorship bias. For every dropout who made it there are fifty stuck.\nMeera: The degree did nothing for me, the college network did everything.\nKabir: Nobody talks about tier 3 colleges. Same fees, zero network.`,
  ],
  idea: ["A 30 second roast of every startup pitch deck", "What your step count says about your week"],
};

type Engine = "gemini" | "pulse-lm";

type Sound = {
  music: "auto" | "upbeat" | "calm" | "dramatic" | "inspiring" | "none";
  musicLevel: "low" | "medium" | "high";
  ducking: boolean;
  sfx: "off" | "low" | "medium" | "high";
  voice: string;
  voiceRatePct: number;
};

const DEFAULT_SOUND: Sound = { music: "auto", musicLevel: "medium", ducking: true, sfx: "medium", voice: "en-IN-NeerjaNeural", voiceRatePct: 0 };

// Small segmented control used by the sound options.
function Segmented<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void }) {
  return (
    <div>
      <span className="text-sm font-medium text-muted">{label}</span>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button key={String(o.value)} onClick={() => onChange(o.value)} aria-pressed={value === o.value} className={cx("rounded-xl px-3 py-1.5 text-sm font-medium transition", value === o.value ? "bg-ink text-bg" : "bg-white/[0.05] text-muted hover:text-ink")}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function CreatePage() {
  const navigate = useNavigate();
  const [type, setType] = useState<(typeof TYPES)[number]["id"]>("topic");
  const [text, setText] = useState("");
  const [batch, setBatch] = useState(false);
  const [engine, setEngine] = useState<Engine>("gemini");
  const [communities, setCommunities] = useState<CommunityRow[]>([]);
  const [communityId, setCommunityId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<JobRow[]>([]);
  const [sound, setSound] = useState<Sound>(DEFAULT_SOUND);
  const [editStyle, setEditStyle] = useState<"creator" | "classic">("creator");
  const [showSound, setShowSound] = useState(false);
  const setS = <K extends keyof Sound>(k: K) => (v: Sound[K]) => setSound((prev) => ({ ...prev, [k]: v }));

  useEffect(() => {
    supabase.from("communities").select("id,name,profile").order("name").then(({ data }) => setCommunities((data as CommunityRow[]) ?? []));
    supabase.from("jobs").select(JOB_COLUMNS).eq("status", "done").order("created_at", { ascending: false }).limit(4).then(({ data }) => setRecent((data as JobRow[]) ?? []));
  }, []);

  const inputs = batch ? text.split("\n").map((l) => l.trim()).filter(Boolean) : [text.trim()].filter(Boolean);
  const current = TYPES.find((t) => t.id === type)!;

  async function submit() {
    setError(null);
    if (inputs.length === 0) return setError("Write a topic, trend, thread or idea first.");
    if (inputs.length > 10) return setError("Batch mode takes up to 10 lines at a time.");
    setBusy(true);
    try {
      const res = await createJobs({ input_type: type, inputs, community_id: communityId || null, options: { engine, editStyle, sound } });
      const ok = res.jobs.filter((j) => j.status !== "failed");
      if (ok.length === 0) throw new Error(res.jobs[0]?.error ?? "Could not start the job");
      navigate(res.batch_id ? `/library?batch=${res.batch_id}` : `/jobs/${ok[0].id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-16">
      <section className="relative">
        <div className="grid-lines pointer-events-none absolute inset-0 -z-10 rounded-[40px] [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber">For the Qoneqt Global Feed</p>
        <h1 className="mt-4 max-w-3xl text-[44px] font-semibold leading-[1.02] sm:text-6xl">
          Turn a community conversation into a <span className="text-brand">video that gets comments.</span>
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-muted">
          Five AI agents research the angle, write and critique the script, direct every shot, and check the real frames before anything is marked ready to publish.
        </p>
      </section>

      <section>
        <SectionTitle>Create</SectionTitle>
        <Card className="space-y-6">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Input type">
            {TYPES.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={type === t.id}
                onClick={() => setType(t.id)}
                className={cx("rounded-xl px-4 py-2 text-sm font-semibold transition", type === t.id ? "bg-ink text-bg" : "bg-white/[0.05] text-muted hover:text-ink")}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={batch ? "One input per line, up to 10. Each line becomes its own video." : current.placeholder}
              rows={type === "thread" || batch ? 8 : 4}
              className="w-full resize-y rounded-2xl border border-line bg-surface px-4 py-3.5 text-[16px] leading-relaxed text-ink placeholder:text-faint focus:border-amber/60 focus:outline-none"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="py-1 text-xs text-faint">Try:</span>
              {(SAMPLES[type] ?? []).map((s) => (
                <button key={s} onClick={() => setText(batch ? (text ? `${text}\n${s}` : s) : s)} className="max-w-full truncate rounded-full bg-white/[0.05] px-3 py-1 text-xs text-muted hover:text-ink">
                  {s.split("\n")[0]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-muted">Community</span>
              <select value={communityId} onChange={(e) => setCommunityId(e.target.value)} className="mt-2 w-full rounded-2xl border border-line bg-surface px-4 py-3 text-[15px] text-ink focus:border-amber/60 focus:outline-none">
                <option value="">Qoneqt Global Feed (default)</option>
                {communities.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <span className="mt-1.5 block text-xs text-faint">Its Community Brain sets the tone, words and topics for every agent.</span>
            </label>

            <div>
              <span className="text-sm font-medium text-muted">Engine</span>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {([
                  { id: "gemini", title: "Cloud Gemini", note: "Five agents · 3 to 5 min", icon: <Sparkles size={16} /> },
                  { id: "pulse-lm", title: "Pulse-LM", note: "Our fine-tuned 4B model · experimental", icon: <Cpu size={16} /> },
                ] as const).map((e) => (
                  <button
                    key={e.id}
                    onClick={() => setEngine(e.id)}
                    aria-pressed={engine === e.id}
                    className={cx("rounded-2xl border p-3 text-left transition", engine === e.id ? "border-amber/60 bg-amber/[0.07]" : "border-line bg-surface hover:border-white/20")}
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold">{e.icon}{e.title}</span>
                    <span className="mt-1 block text-xs text-muted">{e.note}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="border-t border-line pt-5">
            <button onClick={() => setShowSound(!showSound)} className="flex items-center gap-2 text-sm font-semibold text-muted hover:text-ink" aria-expanded={showSound}>
              <SlidersHorizontal size={16} /> Sound and edit
              <span className="font-normal text-faint">
                · {editStyle} edit · music {sound.music}{sound.music !== "none" ? `, ${sound.musicLevel}` : ""} · effects {sound.sfx} · {sound.voice.includes("Prabhat") ? "male" : "female"} voice
              </span>
            </button>
            {showSound ? (
              <div className="mt-5 grid gap-5 md:grid-cols-2">
                <Segmented label="Edit style" value={editStyle} onChange={setEditStyle} options={[{ value: "creator", label: "Creator (fast cuts)" }, { value: "classic", label: "Classic (calm)" }]} />
                <Segmented label="Music" value={sound.music} onChange={setS("music")} options={[{ value: "auto", label: "Auto" }, { value: "upbeat", label: "Upbeat" }, { value: "calm", label: "Calm" }, { value: "dramatic", label: "Dramatic" }, { value: "inspiring", label: "Inspiring" }, { value: "none", label: "No music" }]} />
                <Segmented label="Music volume" value={sound.musicLevel} onChange={setS("musicLevel")} options={[{ value: "low", label: "Low" }, { value: "medium", label: "Medium" }, { value: "high", label: "High" }]} />
                <Segmented label="Duck music under the voice" value={sound.ducking ? "on" : "off"} onChange={(v) => setS("ducking")(v === "on")} options={[{ value: "on", label: "On" }, { value: "off", label: "Off" }]} />
                <Segmented label="Sound effects" value={sound.sfx} onChange={setS("sfx")} options={[{ value: "off", label: "Off" }, { value: "low", label: "Low" }, { value: "medium", label: "Medium" }, { value: "high", label: "High" }]} />
                <Segmented label="Voice" value={sound.voice} onChange={setS("voice")} options={[{ value: "en-IN-NeerjaNeural", label: "Neerja (female)" }, { value: "en-IN-PrabhatNeural", label: "Prabhat (male)" }]} />
                <Segmented label="Voice speed" value={sound.voiceRatePct} onChange={setS("voiceRatePct")} options={[{ value: -10, label: "Slower" }, { value: 0, label: "Normal" }, { value: 10, label: "Faster" }]} />
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-4 border-t border-line pt-6 sm:flex-row sm:items-center">
            <label className="flex cursor-pointer items-center gap-3 text-sm">
              <input type="checkbox" checked={batch} onChange={(e) => setBatch(e.target.checked)} className="peer sr-only" />
              <span className="relative h-6 w-11 rounded-full bg-white/10 transition peer-checked:bg-amber after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-ink after:transition peer-checked:after:translate-x-5" />
              <span className="flex items-center gap-1.5 font-medium"><Layers size={15} />Batch mode</span>
              <span className="text-faint">{batch ? `${inputs.length} video${inputs.length === 1 ? "" : "s"}, rendered in parallel` : "one line, one video"}</span>
            </label>
            <Button onClick={submit} disabled={busy || inputs.length === 0} className="sm:ml-auto">
              {busy ? "Starting…" : batch ? `Generate ${inputs.length || ""} videos` : "Generate video"}
              <ArrowRight size={18} />
            </Button>
          </div>
          {error ? <p className="rounded-2xl bg-red/10 px-4 py-3 text-sm text-red">{error}</p> : null}
        </Card>
      </section>

      {recent.length ? (
        <section>
          <SectionTitle right={<Link to="/library" className="text-sm text-muted hover:text-ink">Library →</Link>}>Recent videos</SectionTitle>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {recent.map((j) => (
              <Link key={j.id} to={`/jobs/${j.id}`} className="group overflow-hidden rounded-3xl border border-white/[0.04] bg-card">
                <div className="aspect-[9/16] bg-surface">{j.thumb_url ? <img src={j.thumb_url} alt="" className="h-full w-full object-cover transition group-hover:scale-[1.02]" loading="lazy" /> : null}</div>
                <div className="p-3 text-sm font-medium leading-snug">{j.title ?? j.input_text.slice(0, 60)}</div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
