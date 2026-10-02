# CLAUDE.md: Qoneqt Pulse (v2, free stack)

Project brief for Claude Code. Read this whole file before writing any code.
Build phase by phase (Section 12). Do not start the next phase until the current one passes its check.

---

## 0. Hard Constraints (never break these)

1. **Total cost is zero.** Free tiers only. No service that needs a credit card.
2. **Everything runs with the owner's laptop switched off.** The product is fully deployed.
3. **Public GitHub repo.** This is a hackathon rule and it also makes GitHub Actions runners free and unlimited.
4. **Quality must not drop because tools are free.** Use designed templates, strong captions, and the critics to keep output good.
5. **No single point of failure.** Every provider has a fallback, and the last fallback needs no API at all.
6. **Do not use Hugging Face Docker Spaces.** Creating them now needs a paid plan.
7. **Do not use Gemini 2.5 models.** They are scheduled for shutdown on 16 Oct 2026 and judges may test the live link after that date. Use Gemini 3.x models, read from env.
8. **Free tiers change.** Never hardcode model names, limits, or prices. Read from env and `/lib/config`.

---

## 1. Hackathon Context

**Event:** CTRL FREAK 2026 (by HackDriven)
**Challenge:** The Qoneqt AI Challenge
**Hard deadline:** Oct 4, 2026, 1:00 AM IST
**Our target:** Submit by Oct 3, 11:00 PM IST. Keep 2 hours buffer.

### About Qoneqt
Qoneqt is a community-first social platform. People discover communities, connect around shared interests, and create, share, and engage with content. It brings conversations, creators, and communities together in one place.

### Problem statement (from organisers)
Build and deploy an AI-powered system that turns a **topic, prompt, idea, or trend** into **engaging video content for the Qoneqt Global Feed**.

- Use **LLMs** for scripting and storytelling
- Use **visual / multimodal models** for generating or processing visuals and video
- The goal is **not a single generation**. The goal is a **repeatable pipeline that produces publish-ready content at scale**

### Expected flow (from organisers)
1. **Input:** Topic / Prompt / Idea / Trend
2. **AI Engine:** LLM makes script and story. Multimodal models make visuals and video. A pipeline composes, processes, and generates. It must be a reliable production workflow.
3. **Output:** A complete, engaging, ready-to-publish video formatted for the Qoneqt Global Feed
4. **Ship it:** Deploy, demo, publish on Qoneqt

### Judging
"We are not judging a concept. We are judging what you actually build and ship."

### Prize and resources
- Rs 10,000 pool across 3 winning teams
- Any LLMs, visual models, multimodal models, and dev stack are allowed
- Qoneqt gives platform access, a technical brief, and team support during the hackathon

### Submission (all three fields are mandatory)
The submission form has exactly these fields:
1. **Video link** (3 to 4 min. The form label says 2 to 4 but the guidelines say 3 to 4, so aim for 3:30)
2. **Project repo link** (public GitHub)
3. **Deployed link** (live, works without our laptop)

Also required by the brief: at least one generated video published on the Qoneqt Global Feed.

### Demo video rules (from organisers)
Length 3 to 4 minutes. **Voiceover is mandatory.** It must include:
1. **Project walkthrough:** how the project works, key features
2. **LLM explanation:** the LLM system we built, its purpose, functionality, and how it works
3. **Tech stack and resources:** technologies, frameworks, APIs, models, datasets, other resources
4. **Relevance to the problem statement:** how it solves the brief and the impact it aims to create

---

## 2. What We Are Building

**Qoneqt Pulse** is an AI production studio that turns community conversations and trends into short vertical videos for the Qoneqt Global Feed.

The LLM system inside is called the **Pulse Engine**. It is a multi-agent LLM system: a Researcher, a Scriptwriter, a Script Critic, a Director, and a Vision Critic. Every agent returns strict JSON. The system **checks its own work, including by looking at frames of the rendered video**, and fixes weak parts before a video is marked ready to publish.

### Why this stands out (keep in mind for every decision)
1. **Community-native.** Takes a real community thread, not only a topic. Each community has a saved "Community Brain" profile (tone, vocabulary, topics) that conditions every agent. This is what makes it Qoneqt-specific and consistent at scale.
2. **LLM is the brain at every step.** It picks the angle, writes the script, and directs every shot (layout, visuals, camera, transitions, caption style, music mood). Not just "LLM writes a script".
3. **Self-critique loops.** Script Critic fixes weak scripts before we spend any image quota. Vision Critic looks at real frames and regenerates bad scenes.
4. **Proof of scale.** Batch mode renders many videos in parallel (one GitHub Actions job per video). Dashboard shows time per video, quality scores, scenes auto-fixed, success rate.
5. **Visible reasoning.** The UI shows every agent's decision and reason, live. Before and after views for script and scenes.
6. **Reliability.** Retries and fallbacks everywhere. A video always finishes, even if an image provider fails.
7. **Zero cost to run.** The dashboard shows the paid-equivalent cost so we can say "this costs Rs 0 on free tiers and about Rs X per video at paid rates".

---

## 3. Video Output Spec

Update after Nayan confirms with the Qoneqt team (Section 15).

- 1080 x 1920 (9:16), 30 fps, MP4 (H.264 video, AAC audio), target under 25 MB
- 30 to 45 seconds, 5 to 8 scenes
- Hook visible from frame 0 (big on-screen text, no slow intro)
- Word-by-word animated captions
- Safe zones: keep text out of the bottom 20% and top 10% (app UI overlays)
- Background music, low volume under the voice
- 1.5 sec outro: Qoneqt logo + community name + comment question
- Thin progress bar at the top (helps retention)
- Also export a thumbnail JPG (frame from the hook scene) for the Library

### Polish checklist (this is where free tools can still look premium)
- Gradient scrim behind captions so text is always readable
- Subtle film grain and vignette overlay
- Consistent color grade across scenes (one style prompt, one palette)
- Mix of AI image scenes and **designed template scenes** (see 7.4). Designed scenes are free, instant, on-brand, and never fail
- 0.2 sec audio fade in and out, music fixed low (about 0.10 volume)
- Scene cuts land on word boundaries, never mid-word

---

## 4. Free Stack (decided, do not re-debate)

| Part | Choice | Why |
|---|---|---|
| Frontend | Vite + React + TypeScript + Tailwind + shadcn/ui, static build | UI prototype comes from Lovable (Vite React). Port it, do not redesign |
| Frontend host | Vercel Hobby (free), with `/api` serverless functions | No card. Functions only trigger jobs, they never render |
| Render worker | **GitHub Actions** on `ubuntu-latest`, public repo | Free and unlimited for public repos. 4 vCPU, 16 GB RAM. Runs even when our laptop is off |
| Database + file storage | **Supabase free** (Postgres + Storage) | No card. Holds jobs, stages, communities, videos, thumbnails |
| Realtime progress | Browser polls Supabase every 2 to 3 sec (or Supabase Realtime) | Simple and reliable |
| LLM + vision | **Gemini API free tier** (Gemini 3.x Flash class models) | One key for text and image input. Use JSON schema output |
| Images | **Cloudflare Workers AI** `flux-1-schnell` (10,000 free neurons per day) | Free, no card. Check the real per-image neuron cost in Phase 1 |
| Voice | **edge-tts** (Python package, no key). Indian English voices such as `en-IN-NeerjaNeural` | Free, natural, supports Hindi and Gujarati too |
| Word timings | edge-tts word boundaries. If a voice does not return them, run **faster-whisper** (tiny or base, CPU) on the audio | Needed for word-by-word captions |
| Video render | **Remotion** (`@remotion/renderer`) inside the Action | React-based, full control of captions and motion |
| Music | 4 royalty-free tracks committed to the repo | No API |
| Validation | `zod` on every LLM output | No broken JSON reaches the renderer |

### Fallback chain (implement all, in this order)
- **LLM:** Gemini primary model -> Gemini second model -> optional Groq or OpenRouter free model (verify the current free list) -> fail the stage with a clear error
- **Vision critic:** Gemini -> if rate limited, **skip the check for that scene** and mark "vision check skipped". Never fail the video for this
- **Images:** Cloudflare FLUX -> second free provider (for example Pollinations or Hugging Face Inference, verify they work without a card) -> **designed template scene** (gradient + big text). The video must always finish
- **Voice:** edge-tts -> Kokoro TTS (open-source, runs on CPU in the Action) -> Gemini TTS
- **Word timings:** edge-tts boundaries -> faster-whisper -> even split by word count (last resort)

### Free-tier realities (design around these)
- Gemini free tier has per-minute and per-day limits that are not fixed. Check the AI Studio rate-limit page for the real numbers. Use retry with backoff on HTTP 429. In batch mode, stagger job start times (about 5 sec apart) and cap parallel jobs at 4 for the demo
- Google may use free-tier inputs to improve its models. Do not send private data
- Cloudflare neurons reset daily at 00:00 UTC (5:30 AM IST). Generate images at portrait size if the model supports width and height. If it does not, generate square and crop. Cache aggressively
- Supabase free projects pause after about 1 week of inactivity. A scheduled keep-alive Action prevents this (Section 10)
- Supabase free file upload limit is small per file, so keep MP4s under 25 MB
- GitHub's terms describe Actions as CI/CD automation. Using it as a render worker is a gray area. Fine for a hackathon demo, but do not hammer it and mention this honestly in the README

---

## 5. Architecture

```
Browser (Vite React SPA on Vercel)
   |
   |  POST /api/jobs   (Vercel function)
   |    - validates input, rate limits per IP
   |    - inserts job row(s) in Supabase (service role)
   |    - triggers GitHub Action: workflow_dispatch render.yml { job_id }
   v
GitHub Action "render" (public repo, ubuntu-latest, 4 vCPU)
   runs: npx tsx pipeline/run.ts <job_id>
     1. ingest        read job + community profile from Supabase
     2. research      Researcher agent
     3. script        Scriptwriter agent
     4. script_critic Script Critic (loop, max 2 revisions)
     5. direct        Director agent
     6. assets        images (parallel, max 3) + TTS per scene + word timings
     7. vision_critic renderStill per scene -> Vision Critic (loop, max 2)
     8. render        Remotion renderMedia -> mp4 + thumbnail
     9. upload        mp4 + thumb -> Supabase Storage, job = done
   (after every stage: write a row to `stages` so the UI updates live)
   |
   v
Supabase: jobs, stages, communities tables + Storage bucket "videos" (public read)
   ^
   |  polls every 2 to 3 sec with the anon key (read-only RLS)
Browser: Job page (agent timeline), Library, Dashboard, Communities
```

### Batch mode
`POST /api/jobs` with many inputs creates one job per input and dispatches one Action run per job. Runs go in parallel. This is the "at scale" proof: 10 videos take about as long as 1.

### Job and stage records
For each stage store: name, status, started_at, ended_at, one-line summary (the decision), reason, output JSON, retry count. Script versions (v1, v2) and vision before/after image URLs live in stage output.

### Reliability rules
- Every external call: retry 3 times with exponential backoff
- If an image fails 3 times: Director rewrites the prompt to be simpler, try once more. If it still fails: switch that scene to a designed template scene. The video still finishes
- If LLM JSON fails zod validation: retry once and include the validation error in the prompt
- Cache assets by hash of (prompt + model + size) in the Action cache and in Supabase, so dev runs do not burn quota
- Any stage that fails after retries writes a clear error and the job is marked `failed` with a readable message (shown in the UI). Never leave a job stuck in `running`. Add a job timeout of 25 minutes
- Quota errors show a friendly UI message: "Free daily quota reached. Resets at 5:30 AM IST. Browse the pre-made gallery meanwhile."

### Security (public repo)
- No secrets in the repo. Secrets live in GitHub Actions secrets and Vercel env vars
- The GitHub token used by the Vercel function is a fine-grained PAT limited to this repo with Actions read/write only
- Supabase anon key is public by design. RLS allows `select` only on `jobs`, `stages`, `communities`. All writes use the service role key, which exists only in the Action and the Vercel function
- Vercel function rate limit: max 5 jobs per IP per hour, max 40 jobs per day overall (tune with env)

---

## 6. Database (Supabase SQL)

```sql
create table communities (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  name text not null,
  profile jsonb not null default '{}'   -- Community Brain, see 7.0
);

create table jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  batch_id uuid,
  status text not null default 'queued',   -- queued | running | done | failed
  input_type text not null,                -- topic | trend | thread | idea
  input_text text not null,
  community_id uuid references communities(id),
  options jsonb not null default '{}',     -- tone, language, voice, style, caption style, etc.
  title text,
  video_url text,
  thumb_url text,
  duration_sec numeric,
  scores jsonb,      -- { script_v1, script_final, vision_avg }
  metrics jsonb,     -- { llm_calls, images, fallbacks, fixes, total_ms, stage_ms{} }
  error text,
  published_url text
);

create table stages (
  id bigint generated always as identity primary key,
  job_id uuid references jobs(id) on delete cascade,
  seq int not null,
  name text not null,       -- ingest | research | script | script_critic | direct | assets | vision_critic | render | upload
  status text not null,     -- pending | running | done | fixed | skipped | failed
  started_at timestamptz,
  ended_at timestamptz,
  summary text,
  reason text,
  output jsonb,
  retries int default 0
);

alter table communities enable row level security;
alter table jobs enable row level security;
alter table stages enable row level security;
create policy "read communities" on communities for select using (true);
create policy "read jobs" on jobs for select using (true);
create policy "read stages" on stages for select using (true);
-- no insert/update/delete policies: writes use the service role only
```

Storage: one public bucket `videos` with folders `<job_id>/video.mp4`, `thumb.jpg`, `stills/`.

---

## 7. The Agents (the Pulse Engine)

All agents return **JSON only**, using Gemini structured output (JSON schema) and validated with zod. Prompts live in `/pipeline/agents/<agent>.ts` as plain template strings so Nayan can tune them.

### 7.0 Community Brain (conditions every agent)
Saved per community. Injected into the Researcher, Scriptwriter, and Director prompts.

```ts
{
  name: string,
  description: string,
  audience: string,
  tone: string,                  // "witty, fast, desi startup slang"
  language: "en-IN" | "hi-IN" | "hinglish" | "gu-IN",
  vocabulary: string[],          // words and phrases the community uses
  topicsToCover: string[],
  topicsToAvoid: string[],
  exampleHooks: string[],        // 3 to 5 hooks that worked (few-shot examples)
  defaultStyle: string,          // visual style preset id
  defaultVoice: string
}
```
A small **Profile Builder** agent creates this JSON from pasted sample posts. Optional feature, cut if short on time (Section 16).

### 7.1 Researcher
**Job:** Read the input and pick the best angle.

Input: `{ inputType, content, communityProfile, audience? }`

Output:
```ts
{
  summary: string,
  angles: Array<{
    title: string,
    hookIdea: string,
    whyItWorks: string,
    targetEmotion: "curiosity" | "surprise" | "inspiration" | "humor" | "debate" | "relatability"
  }>,                    // exactly 3
  chosenIndex: 0 | 1 | 2,
  reason: string
}
```
Prompt direction:
> You are the research lead for Qoneqt, a community-first social platform. Use the community profile. If the input is a community thread, find the most interesting tension, insight, or question people care about. Give 3 different angles for a 30 to 45 sec vertical video. Pick the one most likely to make someone stop scrolling AND comment. Prefer angles that start a community conversation.

### 7.2 Scriptwriter
Output:
```ts
{
  title: string,
  hook: string,                    // max 12 words, spoken in first 2 sec
  scenes: Array<{
    id: string,                    // "s1", "s2"
    purpose: "hook" | "context" | "point" | "twist" | "cta",
    narration: string,             // max 25 words
    onScreenText: string           // max 6 words
  }>,                              // 5 to 8 scenes
  cta: string,                     // a question that makes people comment
  caption: string,                 // suggested post caption with 3 to 5 hashtags
  estDurationSec: number
}
```
Rules in the prompt:
- Scene 1 is the hook. No greetings, no "in this video"
- One idea per scene. Short sentences. Simple spoken language in the community's language and tone
- A twist or pattern break near the middle
- End with a question for the community, not "like and subscribe"
- Total 30 to 45 sec when spoken (about 2.5 words per second)

### 7.3 Script Critic
Output:
```ts
{
  scores: { hook: number, clarity: number, pacing: number, communityFit: number, retention: number },  // 1 to 10
  overall: number,
  verdict: "pass" | "revise",
  issues: Array<{ sceneId: string, problem: string, fix: string }>
}
```
Loop:
- Pass if `overall >= 7.5` AND `hook >= 8` (thresholds come from job options)
- Else send issues back to the Scriptwriter. Max 2 revisions
- Keep the best-scoring version even if none pass
- **Save every version** in the stage output. The UI shows before and after (a demo moment)

### 7.4 Director
**Job:** Turn the script into a shot plan that directly controls the render.

```ts
{
  global: {
    stylePrompt: string,           // added to every image prompt for consistency
    palette: string[],             // 3 to 4 hex colors
    musicMood: "upbeat" | "calm" | "dramatic" | "inspiring"
  },
  shots: Array<{
    sceneId: string,
    layout: "full_image" | "text_card" | "stat_card" | "quote_card",
    visualPrompt?: string,         // only for full_image
    negativePrompt?: string,
    camera: "zoom_in" | "zoom_out" | "pan_left" | "pan_right" | "static",
    transition: "cut" | "fade" | "slide" | "zoom",
    captionStyle: "pop" | "karaoke" | "minimal",
    emphasisWords: string[],
    statValue?: string,            // for stat_card, e.g. "73%"
    useHeroClip: boolean           // max 1 true per video, only if flag is on (off by default)
  }>
}
```
Rules:
- Use at most 5 `full_image` scenes per video. Use designed layouts for the rest. This saves free image quota and looks polished
- Hook scene is usually `text_card` or a strong `full_image`
- Vary camera moves. Keep one visual style for the whole video
- No text inside generated images (captions are added later)

Scene duration is not chosen by the Director. It comes from the real TTS audio length per scene plus 0.2 sec padding.

### 7.5 Vision Critic (main differentiator)
**Job:** Look at real frames of the video and fix bad scenes.

How:
1. After assets are ready, use Remotion `renderStill` for one frame from the middle of each scene (captions on)
2. Send each still with its narration and onScreenText to Gemini (image input)

Output per scene:
```ts
{
  sceneId: string,
  matchesNarration: boolean,
  captionReadable: boolean,
  hasArtifacts: boolean,     // weird hands, broken faces, garbled text
  notes: string,
  score: number,             // 1 to 10
  action: "keep" | "regenerate_image" | "adjust_caption" | "use_template",
  newVisualPrompt?: string
}
```
Loop:
- `regenerate_image`: new image with `newVisualPrompt`, re-render still, re-check. Max 2 rounds per scene
- `adjust_caption`: switch to high-contrast caption (dark backing box)
- `use_template`: swap the scene to a designed layout
- Save before and after stills for every fixed scene. The UI and the demo show these
- If Gemini is rate limited, mark the scene "vision check skipped" and move on

---

## 8. Remotion Composition

- Composition id `PulseVideo`, 1080x1920, 30 fps
- Props: `{ scenes, shots, global, voiceTracks, wordTimings, musicSrc, communityName, brand }`
- Scene types:
  - `full_image`: `<Img>` with Ken Burns motion from `camera` (interpolate scale and translate)
  - `text_card`: gradient background from palette, big animated kinetic text
  - `stat_card`: big number counting up, short label
  - `quote_card`: quote text with accent bar
- Captions: 2 to 4 words at a time, current word highlighted, `emphasisWords` in accent color. Styles `pop`, `karaoke`, `minimal`. Respect safe zones
- Hook text visible from frame 0
- Transitions from `transition`
- Per-scene voice `<Audio>`, one music `<Audio>` low volume
- Outro 1.5 sec with Qoneqt logo, community name, CTA question
- Progress bar at top, grain and vignette overlay
- Fonts loaded locally from `/public/brand/fonts`
- Performance: use `concurrency` equal to the runner CPU count. If a 40 sec video takes more than 6 minutes to render, lower the render `scale` (for example 0.75) or reduce overlay effects. Tell Nayan the measured time

---

## 9. UI

**The UI prototype comes from Lovable and lives in `/ui-prototype` (or `/src` after porting). Port it. Do not redesign it.** It already contains all screens, fields, and mock data shaped like the real JSON types.

Screens: Create, Job page (agent timeline, storyboard, script versions, vision before/after, video player, publish checklist), Library, Communities (Community Brain), Dashboard, How it works, Settings and Status.

Wiring plan:
1. Replace mock data with Supabase reads (`jobs`, `stages`, `communities`)
2. Create button calls `POST /api/jobs`
3. Job page polls the job and stages every 2 to 3 sec until `done` or `failed`
4. Quota meters and provider status come from `/api/status` (a function that checks each provider cheaply, and reads stored counters)
5. Keep the types in `/shared/types.ts` identical to the zod schemas in `/pipeline/schemas`

---

## 10. Deployment (free, laptop off)

1. **Supabase:** create a project, run the SQL in Section 6, create public bucket `videos`
2. **GitHub repo (public):** add Actions secrets `GEMINI_API_KEY`, `CF_ACCOUNT_ID`, `CF_API_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (plus model names as repo variables)
3. **`.github/workflows/render.yml`:** `on: workflow_dispatch` with input `job_id`. Steps: checkout, setup-node with npm cache, install ffmpeg and fonts, `pip install edge-tts faster-whisper`, `npm ci`, `npx remotion browser ensure` (also install the Linux libs Remotion needs, see Remotion docs), then `npx tsx pipeline/run.ts ${{ inputs.job_id }}`. `timeout-minutes: 25`. Cache node_modules and the asset cache
4. **`.github/workflows/keepalive.yml`:** `on: schedule` every 12 hours. Calls the Supabase REST endpoint so the project never pauses. Also runs the provider health check
5. **Vercel:** import the repo, set env vars `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`, `GH_PAT`, `GH_OWNER`, `GH_REPO`. Deploy. The `/api` folder holds the functions
6. **Test with the laptop closed.** Open the live link on a phone, create a video, confirm it finishes
7. **Seed the gallery:** run a batch of 10 real inputs before judging so the Library is full even if a free quota is used up later

Expected render job time: about 4 to 7 minutes per video (queue + setup + render). Batch runs in parallel. Show a friendly "this takes a few minutes" state in the UI with the live agent timeline so waiting feels productive.

---

## 11. Folder Structure

```
/src                      Vite React app (ported from Lovable)
  /pages, /components, /lib
/api                      Vercel functions: jobs.ts, status.ts
/pipeline
  run.ts                  entry used by the Action and by the local CLI
  /agents                 researcher.ts, scriptwriter.ts, scriptCritic.ts, director.ts, visionCritic.ts, profileBuilder.ts
  /providers              llm.ts, vision.ts, image.ts, tts.ts, timings.ts (interfaces + fallbacks)
  /stages                 one file per stage
  /schemas                zod schemas
  /cost                   pricing.ts (paid-equivalent price constants, labeled as estimates)
/remotion                 Root.tsx, PulseVideo.tsx, scenes/*, Captions.tsx, Outro.tsx, ProgressBar.tsx
/shared/types.ts
/public/brand             logo.svg, fonts
/public/music             upbeat.mp3, calm.mp3, dramatic.mp3, inspiring.mp3
/data/samples/inputs.json real test inputs from Nayan
/scripts                  gen.ts (local CLI), check-providers.ts
/supabase/schema.sql
/.github/workflows        render.yml, keepalive.yml
README.md
```

---

## 12. Build Phases

Give Claude Code one phase at a time. Each has a prompt Nayan can paste.

### Phase 1: Ugly end-to-end pipeline on the laptop
**Prompt:** "Read CLAUDE.md. Do Phase 1. Set up the repo with Remotion. Build `npm run gen -- "<topic>"`: one Gemini call for script and scenes, images from Cloudflare FLUX, TTS with edge-tts, word timings, and a Remotion render to `out/video.mp4`. No UI, no critics. Print the time per step, and the neurons used per image."
**Check:** A real mp4 plays with voice, images, and basic captions. We know the real per-image neuron cost and the render time.

### Phase 2: Cloud skeleton (do this early, it is the biggest risk)
**Prompt:** "Do Phase 2. Create the Supabase schema, the `render.yml` GitHub Action, and a Vercel function `/api/jobs` that inserts a job and dispatches the Action. The Action should run the Phase 1 pipeline for the job and upload the mp4 to Supabase Storage and mark the job done. Test with a trivial input."
**Check:** From a phone, with the laptop closed, one request produces a playable video URL.

### Phase 3: Split into agents and log stages
**Prompt:** "Do Phase 3. Split into Researcher, Scriptwriter, Director using Section 7 schemas, with the Community Brain. Write a row to `stages` after each stage with summary, reason, and output."
**Check:** The `stages` table shows each agent's decision for one job.

### Phase 4: Script critic loop
**Prompt:** "Do Phase 4. Add the Script Critic and revision loop in 7.3. Save all script versions."
**Check:** A weak input triggers a revision and the score goes up.

### Phase 5: Make the video look great
**Prompt:** "Do Phase 5. Implement Section 8 fully: scene types, camera motion, transitions, word-level captions with 3 styles, emphasis words, music, outro, progress bar, grain and vignette, safe zones."
**Check:** Nayan watches it and it feels like a real short-form video.

### Phase 6: Vision critic
**Prompt:** "Do Phase 6. Implement 7.5: renderStill per scene, Gemini vision critic, regenerate loop, template fallback, before and after stills saved."
**Check:** A scene with a bad image is detected and replaced.

### Phase 7: UI
**Prompt:** "Do Phase 7. Port the Lovable prototype into this repo and wire it to Supabase and `/api/jobs` as in Section 9. Create page and Job page first."
**Check:** Create a job in the browser and watch the agent timeline update live.

### Phase 8: Batch, Library, Dashboard, Communities
**Prompt:** "Do Phase 8. Add batch mode (one Action run per input, staggered), Library, Dashboard metrics (including paid-equivalent cost), and the Communities page."
**Check:** 5 inputs in, 5 videos out in parallel. Dashboard shows real numbers.

### Phase 9: Hardening and README
**Prompt:** "Do Phase 9. Add provider health checks and the `/api/status` quota view, keepalive workflow, friendly quota errors, job timeouts, and the README (what it is, architecture diagram, agents, how the critics work, setup, env vars, free-tier notes, sample outputs, metrics)."
**Check:** Someone new understands the project in 2 minutes. A forced provider failure still ends in a finished video.

### Suggested timing (adjust to the real start time)
- **Oct 2 (today):** Phases 1 to 3
- **Oct 2 night:** sleep 5 to 6 hrs
- **Oct 3 morning:** Phases 4 to 6
- **Oct 3 afternoon:** Phases 7 and 8
- **Oct 3 evening:** Phase 9, seed gallery, publish on Qoneqt, record demo
- **Oct 3, 11 PM:** submit
- **Oct 3, 11 PM to Oct 4, 1 AM:** buffer only

---

## 13. Rules for Claude Code

1. Get the full pipeline working end to end before polishing anything
2. Every LLM output is JSON and validated with zod
3. All keys in env. Keep `.env.example` updated. Never commit keys. The repo is public
4. Every provider call goes through `/pipeline/providers` with retries, fallbacks, and usage logging
5. Use the asset cache during development to save free quota
6. Keep it simple: no auth, no extra services beyond Vercel, Supabase, GitHub Actions
7. Do not add features that are not in this file without asking first
8. After each phase, run it and show the output (file path, logs, or screenshot)
9. If something is slow or failing, tell Nayan the cause and a simpler option
10. The demo must not crash. Every stage has a fallback
11. Before using any model name, limit, or API shape, check the current official docs. Free tiers and model lists change

---

## 14. Environment Variables

```
# Action secrets (and local .env)
GEMINI_API_KEY=
GEMINI_MODEL_TEXT=            # Gemini 3.x Flash class, not 2.5
GEMINI_MODEL_TEXT_FALLBACK=
GEMINI_MODEL_VISION=
CF_ACCOUNT_ID=
CF_API_TOKEN=
CF_IMAGE_MODEL=@cf/black-forest-labs/flux-1-schnell
EDGE_TTS_VOICE=en-IN-NeerjaNeural
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
ENABLE_HERO_CLIP=false

# Vercel only
SUPABASE_ANON_KEY=
GH_PAT=
GH_OWNER=
GH_REPO=
MAX_JOBS_PER_IP_PER_HOUR=5
MAX_JOBS_PER_DAY=40

# Vite client (public)
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

---

## 15. Qoneqt Context (Nayan fills this in, Claude Code uses it in prompts)

- Global Feed video specs (size, max length, max file size):
- What kind of posts get the most engagement:
- Tone of voice on Qoneqt:
- Top communities to target (and 3 to 5 example posts from each):
- Answers from the Qoneqt team:
- Anything the judges said they care about:

---

## 16. Nayan's Tasks (human work, not for Claude Code)

### Do today before or while Phase 1 runs
1. **Create free accounts (no card):** Google AI Studio (Gemini key), Cloudflare (Workers AI token + account ID), Supabase, Vercel, GitHub (public repo)
2. **Check your real Gemini free limits** at the AI Studio rate-limit page. Note the requests per minute and per day for the model you will use
3. **Qoneqt account:** sign up, upload a test video to check it works, note the limits
4. **Study the Global Feed:** 20 minutes scrolling. Fill Section 15
5. **Ask the Qoneqt team (they offer support):**
   - What does a great Global Feed video look like for you?
   - Ideal length and format?
   - Which communities should we target?
   - Can we use the Qoneqt logo in the outro?
   - What will judges look at most?
6. **Collect 8 to 10 real inputs** (topics, trends, community threads) from Qoneqt into `/data/samples/inputs.json`. Real data makes the demo much stronger
7. **Brand assets:** Qoneqt logo (SVG if possible), colors, 1 to 2 fonts into `/public/brand`
8. **Music:** 4 royalty-free tracks (upbeat, calm, dramatic, inspiring) into `/public/music`. Check the license allows use
9. **Lovable:** paste the Lovable prompt, get the UI prototype, sync it to GitHub, put it in `/ui-prototype`

### During the build
10. **Watch every video** Claude Code makes. Write short notes ("hook too slow", "captions too small") and give them back
11. **Tune the prompts** in `/pipeline/agents`. Hook rules matter most
12. **Test the live site from your phone with the laptop closed**, at least twice

### Final stretch
13. Run a **batch of 10** real inputs so the Library and Dashboard have real data
14. **Publish the best video on the Qoneqt Global Feed.** Save the link and a screenshot
15. **Record the demo video** (script below)
16. Check the repo is **public**, README is clear, live link works on mobile data
17. **Submit by Oct 3, 11 PM** (3 fields: video link, repo link, deployed link)

---

## 17. Demo Video Script (3:30 target, voiceover mandatory)

Record your own voice over a screen recording. Write the script first, do 2 takes. Keep it calm and clear. The 4 required parts are marked.

1. **0:00 to 0:20 Hook.** Play your best finished video, full screen. Then one line: "Qoneqt Pulse turns community conversations into Global Feed videos, and checks its own work before publishing."
2. **0:20 to 1:30 PART 1, Project walkthrough.** Live: paste a real community thread, choose community, hit generate. Show the agent timeline filling in. Open the final video. Show batch mode (several videos at once), the Library, and the Dashboard
3. **1:30 to 2:25 PART 2, LLM explanation.** "The LLM system is the Pulse Engine, five agents." Explain in order: Researcher picks the angle using the Community Brain, Scriptwriter, Script Critic (show the hook before and after with scores), Director (shot plan controls the render), Vision Critic (show a bad frame caught and fixed). Say it uses structured JSON output, retries, and fallbacks
4. **2:25 to 2:55 PART 3, Tech stack and resources.** Gemini (text and vision), Cloudflare FLUX (images), edge-tts (voice), Remotion (video), GitHub Actions (render workers), Supabase (data and storage), Vercel (frontend), React + Tailwind. Mention that it runs fully on free tiers and with no server of ours
5. **2:55 to 3:30 PART 4, Relevance and impact.** Map to the brief: input, AI engine, output, ship. "Repeatable pipeline, not a single generation." Show the video live on the Qoneqt Global Feed. Impact: communities and creators get consistent, on-brand video at scale without a production team. End with the numbers: videos made, average time, average score, scenes auto-fixed, cost Rs 0

---

## 18. Cut List and Risk List

### Cut in this order if time runs out
1. Hero video clips (already off by default)
2. Profile Builder agent (Community Brain stays as manual fields)
3. Dashboard extras (keep only the main 4 numbers)
4. Storyboard scene editing
5. Hindi and Gujarati (keep English and Hinglish)

**Never drop:** working pipeline, strong captions, script critic, vision critic, live deployment, published video on Qoneqt.

### Known risks and answers
1. **Free quota runs out during judging:** pre-made gallery in the Library, friendly quota message, fallback providers
2. **Gemini rate limits in batch:** stagger starts, cap parallel jobs, retry with backoff, vision check can be skipped
3. **edge-tts blocked or no word timings:** faster-whisper timings, Kokoro voice fallback
4. **Render too slow on the runner:** lower render scale, fewer overlay effects
5. **Supabase pauses:** keepalive workflow
6. **GitHub Actions terms are a gray area for this use:** low risk for a hackathon, say so in the README, do not abuse it
