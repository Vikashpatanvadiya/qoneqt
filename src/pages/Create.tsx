import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Cpu, ImagePlus, Layers, Palette, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { PACKS, PACK_IDS, type PackId } from "../styles/packs";
import { uploadImages, type Uploaded, type UploadedVoice } from "../lib/uploads";
import { VoiceoverPicker } from "../components/VoiceoverPicker";
import { ApiError, createJobs } from "../lib/api";
import { useAuth } from "../lib/auth";
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

// Style Pack grid: Auto lets the Director pick (never the same pack twice in a row); classic keeps the older themes.
function StylePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const tile = (id: string, active: boolean) => cx("group relative overflow-hidden rounded-2xl border text-left transition", active ? "border-amber/70 ring-2 ring-amber/40" : "border-line hover:border-white/25");
  return (
    <div className="border-t border-line pt-5">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold text-muted"><Palette size={16} /> Style</span>
        <span className="text-xs text-faint">{value === "auto" ? "Auto: the Director picks a pack for the topic and never repeats your last one" : value === "classic" ? "Classic: the original themes" : `${PACKS[value as PackId]?.name}: ${PACKS[value as PackId]?.mood}`}</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
        <button onClick={() => onChange("auto")} aria-pressed={value === "auto"} className={cx(tile("auto", value === "auto"), "flex aspect-[9/16] flex-col items-center justify-center gap-2 bg-surface p-2 text-center")}>
          <Sparkles size={20} className="text-amber" />
          <span className="text-sm font-semibold">Auto</span>
          <span className="text-[11px] leading-tight text-muted">Director picks</span>
        </button>
        {PACK_IDS.map((id) => (
          <button key={id} onClick={() => onChange(id)} aria-pressed={value === id} title={`${PACKS[id].name}: ${PACKS[id].useFor}`} className={tile(id, value === id)}>
            <img src={`/packs/${id}.jpg`} alt="" loading="lazy" className="aspect-[9/16] w-full object-cover" />
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-2 pb-1.5 pt-6 text-[12px] font-semibold leading-tight text-white">{PACKS[id].name}</span>
          </button>
        ))}
      </div>
      <button onClick={() => onChange(value === "classic" ? "auto" : "classic")} className="mt-2 text-xs text-faint underline-offset-2 hover:text-ink hover:underline">
        {value === "classic" ? "Use Style Packs again" : "Advanced: use the classic themes instead"}
      </button>
    </div>
  );
}

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
  const { session } = useAuth();
  const [needLogin, setNeedLogin] = useState(false);
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
  const [scriptMode, setScriptMode] = useState<"ai" | "own">("ai");
  const [keepWords, setKeepWords] = useState(true);
  const [uploads, setUploads] = useState<Uploaded[]>([]);
  const [mediaMode, setMediaMode] = useState<"mixed" | "ai" | "uploads">("mixed");
  const [uploading, setUploading] = useState(false);
  const [voiceMode, setVoiceMode] = useState<"ai" | "mine">("ai");
  const [voiceover, setVoiceover] = useState<UploadedVoice | null>(null);
  const [stylePack, setStylePack] = useState<string>("auto");

  async function addFiles(list: FileList | null) {
    if (!list?.length) return;
    setError(null);
    const files = Array.from(list).slice(0, 10 - uploads.length);
    setUploading(true);
    try {
      const done = await uploadImages(files);
      // Numbering continues across uploads so [img3] keeps meaning image 3.
      setUploads((prev) => [...prev, ...done.map((u, i) => ({ ...u, index: prev.length + i + 1 }))]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }
  const setS = <K extends keyof Sound>(k: K) => (v: Sound[K]) => setSound((prev) => ({ ...prev, [k]: v }));

  useEffect(() => {
    supabase.from("communities").select("id,name,profile").order("name").then(({ data }) => setCommunities((data as CommunityRow[]) ?? []));
    supabase.from("jobs").select(JOB_COLUMNS).eq("status", "done").order("created_at", { ascending: false }).limit(4).then(({ data }) => setRecent((data as JobRow[]) ?? []));
  }, []);

  const own = scriptMode === "own";
  const useVoiceover = voiceMode === "mine";
  const inputs = useVoiceover
    ? [text.trim() || `My voiceover${voiceover ? ` (${voiceover.name})` : ""}`]
    : batch && !own && session ? text.split("\n").map((l) => l.trim()).filter(Boolean) : [text.trim()].filter(Boolean);
  const current = TYPES.find((t) => t.id === type)!;

  async function submit() {
    setError(null);
    setNeedLogin(false);
    if (useVoiceover && !voiceover) return setError("Record or upload your voiceover first.");
    if (inputs.length === 0) return setError("Write a topic, trend, thread or idea first.");
    if (inputs.length > 10) return setError("Batch mode takes up to 10 lines at a time.");
    setBusy(true);
    try {
      const media = uploads.length ? { mode: mediaMode, uploads: uploads.map(({ index, path, name }) => ({ index, path, name })) } : undefined;
      const res = await createJobs({
        input_type: own || useVoiceover ? "idea" : type,
        inputs,
        community_id: communityId || null,
        options: {
          engine,
          editStyle,
          sound,
          stylePack,
          ...(own && !useVoiceover ? { script: { text: inputs[0], keepWords } } : {}),
          ...(media ? { media } : {}),
          ...(useVoiceover && voiceover ? { voiceover: { path: voiceover.path, name: voiceover.name } } : {}),
        },
      });
      const ok = res.jobs.filter((j) => j.status !== "failed");
      if (ok.length === 0) throw new Error(res.jobs[0]?.error ?? "Could not start the job");
      navigate(res.batch_id ? `/library?batch=${res.batch_id}` : `/jobs/${ok[0].id}`);
    } catch (err) {
      setError((err as Error).message);
      setNeedLogin(err instanceof ApiError && err.needLogin);
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
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-sm font-medium text-muted">Script</span>
            {([
              { id: "ai", label: "AI writes the script" },
              { id: "own", label: "I have my own script" },
            ] as const).map((m) => (
              <button key={m.id} onClick={() => setScriptMode(m.id)} aria-pressed={scriptMode === m.id} className={cx("rounded-xl px-3 py-1.5 text-sm font-semibold transition", scriptMode === m.id ? "bg-brand text-[#141414]" : "bg-white/[0.05] text-muted hover:text-ink")}>
                {m.label}
              </button>
            ))}
            {own ? (
              <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={keepWords} onChange={(e) => setKeepWords(e.target.checked)} className="h-4 w-4 accent-[#fda24a]" />
                Keep my words exactly
              </label>
            ) : null}
          </div>

          <div className={cx("flex flex-wrap gap-2", own && "hidden")} role="tablist" aria-label="Input type">
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
              placeholder={own ? "Paste your script. Start a sentence with [img1] or {{image:2}} to put your uploaded image there." : batch ? "One input per line, up to 10. Each line becomes its own video." : current.placeholder}
              rows={own || type === "thread" || batch ? 8 : 4}
              className="w-full resize-y rounded-2xl border border-line bg-surface px-4 py-3.5 text-[16px] leading-relaxed text-ink placeholder:text-faint focus:border-amber/60 focus:outline-none"
            />
            {own ? <p className="mt-2 text-xs text-faint">{keepWords ? "Your words are used exactly. AI only splits them into scenes, adds on-screen text and gives advice." : "AI may tighten your script for pacing and length."}</p> : null}
            <div className={cx("mt-3 flex flex-wrap gap-2", own && "hidden")}>
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

          <div className="space-y-3 border-t border-line pt-5">
            <Segmented
              label="Voice"
              value={voiceMode}
              onChange={setVoiceMode}
              options={[{ value: "ai", label: "AI voice" }, { value: "mine", label: "My voiceover" }]}
            />
            {useVoiceover ? (
              <>
                <VoiceoverPicker value={voiceover} onChange={setVoiceover} onError={setError} />
                <p className="text-xs text-faint">Your recording is transcribed with word timings: your words become the script and the captions, and the AI voice is skipped. The text box above is optional; use it as a title or topic. Image tags like [img1] can't be used here; your images are matched by meaning.</p>
              </>
            ) : null}
          </div>

          <div className="border-t border-line pt-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-2 text-sm font-semibold text-muted"><ImagePlus size={16} /> My media</span>
              <label className={cx("cursor-pointer rounded-xl border border-line bg-surface px-3 py-1.5 text-sm font-medium hover:border-white/20", (uploading || uploads.length >= 10) && "pointer-events-none opacity-50")}>
                {uploading ? "Uploading…" : "Add images"}
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(e) => addFiles(e.target.files)} />
              </label>
              <span className="text-xs text-faint">Up to 10 · JPG, PNG, WebP · 5 MB each · EXIF and location are removed</span>
            </div>
            {uploads.length ? (
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap gap-2">
                  {uploads.map((u) => (
                    <figure key={u.path} className="relative w-20">
                      <img src={u.preview} alt={u.name} className="aspect-[3/4] w-20 rounded-lg object-cover" />
                      <figcaption className="mt-1 text-center text-[11px] text-muted">[img{u.index}]</figcaption>
                      <button onClick={() => setUploads(uploads.filter((x) => x.path !== u.path))} className="absolute right-1 top-1 rounded-full bg-black/70 p-0.5" aria-label={`Remove ${u.name}`}><X size={12} /></button>
                    </figure>
                  ))}
                </div>
                <Segmented label="Images in the video" value={mediaMode} onChange={setMediaMode} options={[{ value: "mixed", label: "Mixed (my images first, AI for the rest)" }, { value: "uploads", label: "Only my images" }, { value: "ai", label: "Only AI images" }]} />
                <p className="rounded-xl bg-amber/10 px-3 py-2 text-xs text-amber">Only upload images you have the right to use. The video may be public.</p>
              </div>
            ) : null}
          </div>

          <StylePicker value={stylePack} onChange={setStylePack} />

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
              <input type="checkbox" checked={batch && !own && Boolean(session)} disabled={own || !session} onChange={(e) => setBatch(e.target.checked)} className="peer sr-only" />
              <span className="relative h-6 w-11 rounded-full bg-white/10 transition peer-checked:bg-amber after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-ink after:transition peer-checked:after:translate-x-5" />
              <span className="flex items-center gap-1.5 font-medium"><Layers size={15} />Batch mode</span>
              <span className="text-faint">{batch ? `${inputs.length} video${inputs.length === 1 ? "" : "s"}, rendered in parallel` : "one line, one video"}</span>
            </label>
            <Button onClick={submit} disabled={busy || inputs.length === 0} className="sm:ml-auto">
              {busy ? "Starting…" : batch ? `Generate ${inputs.length || ""} videos` : "Generate video"}
              <ArrowRight size={18} />
            </Button>
          </div>
          {error ? (
            <p className="rounded-2xl bg-red/10 px-4 py-3 text-sm text-red">
              {error}
              {needLogin ? <> <Link to="/login?next=/" className="font-semibold underline">Log in</Link></> : null}
            </p>
          ) : null}
          {!session ? <p className="text-xs text-faint">No account needed for your first video. <Link to="/login?next=/" className="text-amber">Log in</Link> to make more, use batch mode and delete your videos.</p> : null}
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
