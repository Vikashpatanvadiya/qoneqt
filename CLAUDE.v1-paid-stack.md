# CLAUDE.md: Qoneqt Pulse

Project brief for Claude Code. Read this whole file before writing any code.
Build phase by phase (Section 10). Do not start the next phase until the current one passes its check.

---

## 1. Hackathon Context

**Event:** CTRL FREAK 2026 (by HackDriven)
**Challenge:** The Qoneqt AI Challenge
**Hard deadline:** Oct 4, 2026, 1:00 AM IST
**Team target:** Submit by Oct 3, 11:00 PM IST (keep 2 hours buffer)

### About Qoneqt
Qoneqt is a community-first social platform. People discover communities, connect around shared interests, and create, share, and engage with content. It brings conversations, creators, and communities together in one place.

### Problem statement (from organisers)
Build and deploy an AI-powered system that turns a **topic, prompt, idea, or trend** into **engaging video content for the Qoneqt Global Feed**.

- Use **LLMs** for scripting and storytelling
- Use **visual / multimodal models** for generating or processing visuals and video
- The goal is **not a single generation**. The goal is a **repeatable pipeline that produces publish-ready content at scale**

### Expected flow (from organisers)
1. **Input:** Topic / Prompt / Idea / Trend. Defines the subject, angle, or trend.
2. **AI Engine:** LLM → Script / Story. Multimodal models → Visuals / Video. Pipeline → Compose / Process / Generate. Turn input into hook, script, and scene plan. Generate or assemble visuals and video. Orchestrate a reliable production workflow.
3. **Output:** A complete, engaging, ready-to-publish video formatted for the Qoneqt Global Feed.
4. **Ship it:** Deploy → Demo → Publish on Qoneqt.

### Judging
"We are not judging a concept. We are judging what you actually build and ship."

### Submission requirements (all mandatory)
1. Public GitHub repo
2. Live deployment
3. Demo video
4. At least one generated video published on the Qoneqt Global Feed

### Rules
- Any LLM, visual model, multimodal model, or dev stack is allowed
- Prize: ₹10,000 pool across 3 winning teams

---

## 2. What We Are Building

**Qoneqt Pulse** is an AI production studio that turns community conversations and trends into short vertical videos for the Qoneqt Global Feed.

It works like a small video team made of AI agents: a researcher, a scriptwriter, a director, and two critics. The system **checks its own work** (including looking at the rendered frames) and fixes weak parts before a video is marked ready to publish.

### Why this stands out (keep this in mind for every decision)
1. **Community-native input.** Can take a real community thread or trend, not just a topic. Fits Qoneqt's core idea.
2. **LLM is the brain at every step.** The LLM picks the angle, writes the script, directs every shot (visuals, motion, transitions, caption style, music mood). Not just "LLM writes a script."
3. **Vision critic.** A vision LLM looks at frames of the actual video and regenerates bad scenes. Most teams will never check their output.
4. **Proof of scale.** Batch mode plus a dashboard showing time per video, cost per video, quality scores, and scenes auto-fixed.
5. **Visible reasoning.** The UI shows every agent's decision and reason, live.
6. **Reliability.** Retries and fallbacks everywhere. The demo must never crash.

---

## 3. Video Output Spec

Default spec. Update after Nayan confirms with the Qoneqt team (Section 13).

- 1080 x 1920 (9:16), 30 fps, MP4 (H.264 video, AAC audio)
- 30 to 45 seconds, 5 to 8 scenes
- **Hook visible from frame 1** (big on-screen text, no slow intro)
- Word-by-word animated captions
- Safe zones: keep text out of the bottom 20% and top 10% (app UI overlays)
- Background music, low volume under the voice
- 1.5 sec outro: Qoneqt logo + community name + call to comment
- Thin progress bar at top of the video (helps retention)

---

## 4. Tech Stack

| Part | Choice | Why |
|---|---|---|
| App | Next.js (App Router), TypeScript, Tailwind | One codebase for UI and API |
| Video render | Remotion (`@remotion/bundler`, `@remotion/renderer`) | Video as React code, full control |
| Deploy | Railway with a Dockerfile | Renders take minutes, Vercel serverless will time out. Remotion needs Chrome deps |
| Storage | SQLite (`better-sqlite3`) + files in `DATA_DIR` on a Railway volume | Simple, no extra service |
| Queue | In-process queue (`p-queue`), concurrency 2 | Enough for hackathon scale |
| Validation | `zod` for every LLM output | No broken JSON reaching the renderer |
| Progress | Client polls `GET /api/jobs/:id` every 2 sec | Simpler than SSE / websockets |

### Providers (wrap each behind an interface in `/lib/providers` so they can be swapped)
- **LLM (text):** Anthropic Claude. Model name from env.
- **Vision critic:** Claude with image input. Model name from env.
- **Images:** fal.ai (Flux). Model name from env.
- **Voice:** ElevenLabs "with timestamps" endpoint (gives character timing → build word timings for captions). Fallback: OpenAI TTS + Whisper word timestamps.
- **Optional hero clip:** fal.ai image-to-video for max 1 scene per video. Behind a flag, **off by default** (slow and costly).

Do not hardcode model IDs anywhere. Read from env.

---

## 5. Architecture

```
[UI: Create / Batch]
        |
        v
  POST /api/jobs  --->  Job Queue (p-queue, concurrency 2)
                               |
                               v
   1. ingest
   2. research        (Researcher agent)
   3. script          (Scriptwriter agent)
   4. script_critic   (Script Critic agent, loop max 2)
   5. direct          (Director agent)
   6. assets          (images in parallel + TTS per scene)
   7. preview_stills  (Remotion renderStill, 1 frame per scene)
   8. vision_critic   (Vision Critic agent, loop max 2)
   9. render          (Remotion renderMedia -> mp4)
  10. done / failed
                               |
                               v
   SQLite job record + files in DATA_DIR/jobs/<id>/
                               |
                               v
[UI: Job page (agent timeline, storyboard, before/after, video), Library, Dashboard]
```

### Job record (per stage)
For each stage store: input, output, status, started_at, ended_at, tokens used, cost estimate (INR and USD), error, retry count.

### Reliability rules
- Every external call: retry 3 times with exponential backoff.
- If an image fails 3 times: Director rewrites the prompt simpler, try once more. If still failing: fallback scene with a brand gradient background and big on-screen text. The video must still finish.
- If TTS fails: retry, then fallback provider.
- If any LLM JSON fails zod validation: retry once and include the validation error in the prompt.
- Cache assets by hash of (prompt + model). Same prompt during dev = reuse file, no new cost.

---

## 6. The Agents

All agents return **JSON only**. Validate each with zod. Prompts live in `/lib/agents/<agent>.ts` as plain template strings so Nayan can tune them easily.

### 6.1 Researcher
**Job:** Read the input and pick the best angle.

Input:
```ts
{
  inputType: "topic" | "prompt" | "trend" | "thread",
  content: string,          // topic text, or a pasted community thread
  communityName?: string,
  audience?: string
}
```

Output:
```ts
{
  summary: string,                 // what this input is really about, 2 lines
  angles: Array<{
    title: string,
    hookIdea: string,
    whyItWorks: string,
    targetEmotion: "curiosity" | "surprise" | "inspiration" | "humor" | "debate" | "relatability"
  }>,                              // exactly 3
  chosenIndex: 0 | 1 | 2,
  reason: string
}
```

Prompt direction:
> You are the research lead for Qoneqt, a community-first social platform. Read the input. If it is a community thread, find the most interesting tension, insight, or question people care about. Give 3 different angles for a 30 to 45 sec vertical video. Pick the one most likely to make someone stop scrolling AND comment. Prefer angles that start a community conversation. Return only JSON.

### 6.2 Scriptwriter
**Job:** Write the hook, narration, and on-screen text.

Output:
```ts
{
  title: string,
  hook: string,                    // max 12 words, spoken in first 2 sec
  scenes: Array<{
    id: string,                    // "s1", "s2"...
    purpose: "hook" | "context" | "point" | "twist" | "cta",
    narration: string,             // max 25 words
    onScreenText: string           // max 6 words
  }>,                              // 5 to 8 scenes
  cta: string,                     // a question that makes people comment
  estDurationSec: number
}
```

Rules to put in the prompt:
- Scene 1 is the hook. No greetings, no "in this video".
- One idea per scene. Short sentences. Simple spoken English.
- Use a pattern break or twist around the middle.
- End with a question for the community, not "like and subscribe".
- Total 30 to 45 sec when spoken (about 2.5 words per sec).

### 6.3 Script Critic
**Job:** Score the script before we spend money on images and voice.

Output:
```ts
{
  scores: { hook: number, clarity: number, pacing: number, communityFit: number, retention: number }, // 1 to 10
  overall: number,
  verdict: "pass" | "revise",
  issues: Array<{ sceneId: string, problem: string, fix: string }>
}
```

Loop logic:
- Pass if `overall >= 7.5` AND `hook >= 8`.
- Else send issues back to Scriptwriter. Max 2 revisions.
- Keep the best-scoring version, even if none pass.
- **Save every version.** The UI shows before/after (this is a demo moment).

### 6.4 Director
**Job:** Turn the script into a shot plan that directly controls the render.

Output:
```ts
{
  global: {
    stylePrompt: string,           // added to every image prompt for visual consistency
    palette: string[],             // 3 to 4 hex colors for captions/accents
    musicMood: "upbeat" | "calm" | "dramatic" | "inspiring"
  },
  shots: Array<{
    sceneId: string,
    visualPrompt: string,
    negativePrompt?: string,
    camera: "zoom_in" | "zoom_out" | "pan_left" | "pan_right" | "static",
    transition: "cut" | "fade" | "slide" | "zoom",
    captionStyle: "pop" | "karaoke" | "minimal",
    emphasisWords: string[],       // words to highlight in accent color
    useHeroClip: boolean           // max 1 true per video, only if flag is on
  }>
}
```

Prompt direction:
> You are a short-form video director. For each scene, design one strong visual that matches the narration, with no text inside the image (captions are added later). Vary camera moves so the video never feels static. Keep one consistent visual style for the whole video.

Scene duration is not chosen by the Director. It comes from the real TTS audio length per scene + 0.2 sec padding.

### 6.5 Vision Critic (main differentiator)
**Job:** Look at real frames of the video and fix bad scenes.

How:
1. After assets are ready, use Remotion `renderStill` to render one frame from the middle of each scene (with captions on).
2. Send each still + its narration + onScreenText to the vision model.

Output per scene:
```ts
{
  sceneId: string,
  matchesNarration: boolean,
  captionReadable: boolean,
  hasArtifacts: boolean,           // weird hands, broken faces, garbled text, etc.
  notes: string,
  score: number,                   // 1 to 10
  action: "keep" | "regenerate_image" | "adjust_caption",
  newVisualPrompt?: string
}
```

Loop logic:
- `regenerate_image` → new image with `newVisualPrompt`, re-render that still, re-check. Max 2 rounds per scene.
- `adjust_caption` → switch caption to a high-contrast style (dark backing box).
- **Save before/after stills** for every fixed scene. The UI and demo show these.

---

## 7. Remotion Composition

- Composition id: `PulseVideo`, 1080x1920, 30 fps
- Props: `{ scenes, shots, global, voiceTracks, wordTimings, musicSrc, communityName }`
- Each scene:
  - `<Img>` with Ken Burns motion from `camera` using `interpolate` on scale and translate
  - Transition based on `transition`
  - Per-scene voice `<Audio>`
- Captions:
  - Show 2 to 4 words at a time, current word highlighted
  - `emphasisWords` in the accent color from `palette`
  - Styles: `pop` (scale bounce), `karaoke` (color fill), `minimal`
  - Respect safe zones (Section 3)
- Hook: scene 1 `onScreenText` large and visible from frame 0
- Music: `<Audio>` at about 0.12 volume, chosen by `musicMood` from `/public/music`
- Outro: 1.5 sec, Qoneqt logo + community name + CTA question
- Progress bar at top
- Fonts loaded locally from `/public/brand/fonts`

---

## 8. UI

Dark theme, purple accent (match Qoneqt deck). Clean and minimal. Nayan (product designer) will refine visuals, so build clean reusable components.

1. **`/` Create**
   - Tabs: Topic, Trend, Community Thread (large textarea for pasted thread)
   - Community name field
   - "Batch" toggle: one input per line → one job each
   - Generate button
2. **`/jobs/[id]` Job page** (the main demo screen)
   - **Agent timeline:** one card per agent with status, key decision, short reason, and score
   - **Script versions:** v1 vs final, with critic scores
   - **Storyboard grid:** one still per scene
   - **Vision critic panel:** before/after stills for fixed scenes, with the critic's note
   - **Final video player** + download button
   - Time and cost for this job
3. **`/library`** Grid of finished videos with score, time, cost, community
4. **`/dashboard`** Totals: videos made, avg time per video, avg cost per video, avg script score, avg vision score, scenes auto-fixed, failure rate

---

## 9. Folder Structure

```
/app
  /page.tsx                 Create
  /jobs/[id]/page.tsx       Job page
  /library/page.tsx
  /dashboard/page.tsx
  /api/jobs/route.ts        POST create, GET list
  /api/jobs/[id]/route.ts   GET job
  /api/files/[...path]/route.ts  serve videos and stills from DATA_DIR
/lib
  /agents                   researcher.ts, scriptwriter.ts, scriptCritic.ts, director.ts, visionCritic.ts
  /providers                llm.ts, vision.ts, image.ts, tts.ts (interfaces + implementations)
  /pipeline                 runJob.ts, stages/*.ts, queue.ts
  /db                       sqlite.ts, schema.sql
  /cost                     pricing.ts (price constants per provider)
  /schemas                  zod schemas
/remotion
  Root.tsx, PulseVideo.tsx, Scene.tsx, Captions.tsx, Outro.tsx, ProgressBar.tsx
/public
  /brand                    logo.svg, fonts
  /music                    upbeat.mp3, calm.mp3, dramatic.mp3, inspiring.mp3
/data/samples/inputs.json   real test inputs from Nayan
/scripts/gen.ts             CLI: npm run gen -- "topic"
Dockerfile
.env.example
README.md
```

---

## 10. Build Phases

Give Claude Code one phase at a time. Each phase has a prompt Nayan can paste.

### Phase 1: Ugly end-to-end pipeline (highest priority)
**Prompt:** "Read CLAUDE.md. Do Phase 1. Set up Next.js + Remotion. Build `npm run gen -- "<topic>"` that does one LLM call for script + scenes, generates images, generates TTS per scene, and renders an mp4 to `out/`. No UI, no critics yet."
**Check:** A real mp4 plays with voice, images, and basic captions.

### Phase 2: Split into agents + job store
**Prompt:** "Do Phase 2. Split into Researcher, Scriptwriter, Director agents with zod schemas from Section 6. Add SQLite job store and stage logging with tokens and cost."
**Check:** One job record shows every agent's input and output.

### Phase 3: Script critic loop
**Prompt:** "Do Phase 3. Add Script Critic with the loop logic in 6.3. Save all script versions."
**Check:** A weak topic triggers at least one revision and the score goes up.

### Phase 4: Make the video look great
**Prompt:** "Do Phase 4. Implement Section 7 fully: camera motion, transitions, word-level captions with 3 styles, emphasis words, music, outro, progress bar, safe zones."
**Check:** Nayan watches it and it feels like a real short-form video.

### Phase 5: Vision critic
**Prompt:** "Do Phase 5. Implement 6.5: renderStill per scene, vision critic, regenerate loop, save before/after stills."
**Check:** A scene with a bad image gets detected and replaced.

### Phase 6: API + UI
**Prompt:** "Do Phase 6. Build the API routes, queue, and pages from Section 8 (Create and Job page first)."
**Check:** Create a job from the browser and watch the agent timeline update live.

### Phase 7: Batch + Library + Dashboard
**Prompt:** "Do Phase 7. Add batch mode, library, and dashboard metrics."
**Check:** 5 inputs in → 5 videos out, dashboard shows real numbers.

### Phase 8: Deploy
**Prompt:** "Do Phase 8. Write a Dockerfile that works with Remotion (Chrome deps), deploy-ready for Railway with a volume at DATA_DIR. Add a /api/health route."
**Check:** Live URL works from a different device and can generate a video.

### Phase 9: README
**Prompt:** "Do Phase 9. Write README with what it is, architecture diagram, agent list, how the critics work, setup steps, env vars, sample outputs, and metrics."
**Check:** Someone new can understand the project in 2 minutes.

### Suggested timing (adjust to your real start time)
- **Oct 2 (today):** Phases 1 to 3
- **Oct 2 night:** sleep 5 to 6 hrs
- **Oct 3 morning:** Phases 4 and 5
- **Oct 3 afternoon:** Phases 6 and 7
- **Oct 3 evening:** Phase 8, publish on Qoneqt, record demo, Phase 9
- **Oct 3, 11 PM:** submit
- **Oct 3, 11 PM to Oct 4, 1 AM:** buffer only

---

## 11. Rules for Claude Code

1. Get the full pipeline working end to end before polishing anything.
2. Every LLM output is JSON and validated with zod.
3. All keys in env. Keep `.env.example` updated. Never commit keys.
4. Every provider call goes through `/lib/providers` and logs tokens and cost.
5. Use the asset cache during development to save money.
6. Keep it simple: no auth, no microservices, no extra databases.
7. Do not add features that are not in this file without asking first.
8. After each phase, run it and show the output (file path, logs, or screenshot).
9. If something is slow or failing, tell Nayan the cause and a simpler option.
10. The demo must not crash. Every stage has a fallback.

---

## 12. Environment Variables

```
ANTHROPIC_API_KEY=
LLM_MODEL=
VISION_MODEL=
FAL_KEY=
IMAGE_MODEL=
HERO_CLIP_MODEL=
ENABLE_HERO_CLIP=false
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
OPENAI_API_KEY=            # optional fallback for TTS + Whisper
DATA_DIR=./data
USD_TO_INR=
```

---

## 13. Qoneqt Context (Nayan fills this in, Claude Code uses it in prompts)

- Global Feed video specs (size, max length, max file size):
- What kind of posts get the most engagement:
- Tone of voice on Qoneqt:
- Top communities to target:
- Answers from the Qoneqt team:
- Anything the judges said they care about:

---

## 14. Nayan's Tasks (human work, not for Claude Code)

### Before coding starts
1. **API keys + credits:** Anthropic, fal.ai, ElevenLabs (and OpenAI as backup). Add a small amount of credit to each. Put them in `.env`.
2. **Qoneqt account:** Sign up, upload a test video to check it works and note the limits.
3. **Study the Global Feed:** 20 minutes scrolling. Fill Section 13.
4. **Ask the Qoneqt team (they offer support):**
   - What does a great Global Feed video look like for you?
   - Ideal length and format?
   - Which communities should we target?
   - Can we use the Qoneqt logo in the outro?
   - What will judges look at most?
5. **Collect real inputs:** 8 to 10 real topics, trends, or community threads from Qoneqt. Save to `/data/samples/inputs.json`. Real data makes the demo much stronger than made-up topics.
6. **Brand assets:** Qoneqt logo (SVG if possible), colors, 1 to 2 fonts → `/public/brand`.
7. **Music:** 4 royalty-free tracks (upbeat, calm, dramatic, inspiring) → `/public/music`. Check the license allows use.
8. **Voice:** Pick 1 to 2 ElevenLabs voices that fit Qoneqt. Put the ID in env.

### During the build
9. **Watch every video** Claude Code makes. Write short notes like "hook too slow", "captions too small", "image doesn't match scene 3" and give them back.
10. **Tune the prompts** in `/lib/agents`. The hook rules matter most.
11. **Design the UI:** give Claude Code clear direction (or screenshots) for the Job page, since it is the main demo screen.

### Final stretch
12. Run a **batch of 10** real inputs so the dashboard has real numbers.
13. **Publish the best video on the Qoneqt Global Feed.** Take a screenshot and save the link.
14. **Record the demo video** (script below).
15. Make the GitHub repo **public**, check README, check live URL from a phone.
16. **Submit by Oct 3, 11 PM.**

---

## 15. Demo Video Script (2 to 3 min)

1. **0:00 to 0:15** Play the best finished video. No intro slides.
2. **0:15 to 0:30** One line: "Qoneqt Pulse turns community conversations into Global Feed videos, and checks its own work before publishing."
3. **0:30 to 1:15** Live: paste a real community thread → show the agent timeline (researcher angle, script v1 vs final with scores, director shot plan).
4. **1:15 to 1:45** Vision critic: show a bad scene being caught and fixed (before/after).
5. **1:45 to 2:15** Dashboard: "X videos in Y minutes, ₹Z per video, average score N, M scenes auto-fixed."
6. **2:15 to 2:30** Show the video live on the Qoneqt Global Feed. End.

---

## 16. Cut List (if time runs out)

Drop in this order:
1. Hero video clips
2. Dashboard extras (keep only the main 4 numbers)
3. Batch mode UI (keep batch via CLI)
4. Library page

**Never drop:** working pipeline, good captions, script critic, vision critic, live deployment, published video on Qoneqt.
