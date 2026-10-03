# Slides for the demo video (10 slides + live website)

Keep slides short: the voice explains, the slide only anchors. Times match `docs/demo-script.md`.
"ON SLIDE" is the text to put on the slide; "SAY / DO" is for you, not the slide.

Links to keep open in browser tabs before recording:
- Live site: https://qoneqt-three.vercel.app
- Repo: https://github.com/Vikashpatanvadiya/qoneqt
- Your video on the Qoneqt Global Feed (the post link)
- One finished Job page and one fresh Job page (started 5 minutes before recording)

---

## Slide 1: Title (0:00 to 0:15)
ON SLIDE
- **Qoneqt Pulse**
- Community conversations in. Global Feed videos out.
- CTRL FREAK 2026 · The Qoneqt AI Challenge · {team name}

Background: a still from your best video, darkened.
SAY / DO: play your best video for 6 to 8 seconds first, then show this slide.

## Slide 2: The problem (0:15 to 0:25)
ON SLIDE
- **Communities need video every day**
- Editing one short takes hours
- One-off AI clips look generic and need fixing
- Qoneqt asked for a **repeatable pipeline**, not a single generation

## Slide 3: What Pulse does (0:25 to 0:35)
ON SLIDE: one row of 4 steps with arrows
**Topic · Trend · Idea · Thread → 5 AI agents → Publish-ready 9:16 video → Post on Qoneqt**

Small line under it: *Writes, directs, edits and checks its own work.*

---

## LIVE WEBSITE (0:35 to 1:15): switch to the browser, no slide
DO, in this order (about 40 seconds):
1. **Create page:** pick a sample topic, show Community, Engine, and the **Style** grid (hover 2 or 3 packs, leave Auto).
2. Show the options in one sweep: **My own script**, **My voiceover**, **My media**.
3. Open the **fresh Job page:** scroll the live agent timeline (each step shows its decision and reason).
4. Play the finished video for 3 seconds.
5. Click **Edit video:** cut one scene, change one text line (no need to render).
6. **Library:** show the different Style Pack badges.
7. **Post on Qoneqt** panel: download + copy caption + open Qoneqt.

Then switch back to the slides.

---

## Slide 4: How the LLM works (1:15 to 1:50)
ON SLIDE
- Title: **How the LLM works: the Pulse Engine**
- Left (60%): `docs/diagrams/1-pulse-engine.png`
- Right (40%), 5 numbered steps:
  1. **Researcher** reads the topic and the Community Brain, writes 3 angles, keeps the one most likely to get comments
  2. **Scriptwriter** writes the hook and 5 to 8 scenes
  3. **Script Critic**, a different model, scores the script; below 7.5, it is rewritten (max 2)
  4. **Director** picks the Style Pack and plans every shot
  5. **Vision Critic** looks at real frames and regenerates bad images
- Bottom line: *Every answer is strict JSON, checked in code. A busy model hands over to the next one.*

SAY (about 35 s): "The LLM system is the Pulse Engine: five agents, each with one job. The Researcher picks the angle, the Scriptwriter writes, and a different model critiques it, rewriting until it passes. The Director turns the script into a shot plan, and after rendering, the Vision Critic looks at the real frames and fixes bad pictures. Every answer is strict JSON, validated in code, and if a model is busy, the next one takes over."

## Slide 5: It checks itself, and we trained our own model (1:50 to 2:20)
ON SLIDE: two halves
- Left half, title **It checks its own work**: two small screenshots from one Job page, stacked
  - Script Critic: v1 → v2 with the real scores
  - Vision Critic: image before → after
- Right half, title **Pulse-LM: our own model**:
  - 450 plans written by Gemini (the teacher)
  - 137 kept after schema checks and critic score ≥ 8
  - Qwen3-4B fine-tuned with LoRA on a free Colab GPU
  - Runs in Ollama on the render server: no paid API
  - 100% valid JSON · critic 6.6 vs Gemini 7.41 → **experimental engine**
- Optional: `docs/diagrams/2-pulse-lm.png` as a small image under the right half, or skip it to keep the slide clean.

SAY (about 30 s): "Here you can see it fixing itself: the script score going up after a rewrite, and a bad image replaced after the Vision Critic saw it. We also trained our own model, Pulse-LM. Gemini wrote 450 example plans, our critic kept the best 137, and we fine-tuned Qwen3 4B with LoRA on a free GPU. It always returns valid JSON, but it scores 6.6 against Gemini's 7.4, so it is an experimental engine you can pick on the Create page."

## Slide 6: Tech stack (2:20 to 2:35)
ON SLIDE: a grid of 8 labelled tiles
| Brain | Visuals | Voice | Video |
|---|---|---|---|
| Gemini 3 Flash / Flash-Lite, Gemma 4 | FLUX (Pollinations, Cloudflare) | edge-tts, faster-whisper | Remotion (React) |
| **App** | **Workers** | **Data** | **Our model** |
| React, Vite, Tailwind on Vercel | GitHub Actions (1 runner per video) | Supabase: Postgres, Storage, Auth | Pulse-LM (Qwen3-4B + LoRA) |

## Slide 7: Architecture (2:35 to 2:50)
ON SLIDE
- Title: **Runs fully deployed, on free tiers**
- Image: `docs/diagrams/3-architecture.png`

## Slide 8: Built for the brief (2:50 to 3:05)
ON SLIDE: 4 rows
| The brief asked | Pulse does |
|---|---|
| **Input:** topic, prompt, idea, trend | + real community threads, own script, own voice, own photos |
| **AI engine:** LLM + visual models | 5 agents + Vision Critic on real frames |
| **Output:** ready-to-publish video | 9:16, captions, sound, 8 Style Packs, QA-checked |
| **Ship:** deploy, demo, publish | Live site · batch of 10 in parallel · posted on Qoneqt |

## Slide 9: Impact (3:05 to 3:20)
ON SLIDE: 4 big numbers (from your Dashboard)
- **{videos made}** videos made
- **{average time}** min per video
- **{average score}** average script score
- **₹0** per video

Line under it: *Every community can post on-brand video daily, without a production team.*

SAY / DO: then show your post live on the Qoneqt Global Feed for 3 to 5 seconds.

## Slide 10: Thank you (3:20 to 3:30)
ON SLIDE
- **Qoneqt Pulse**
- Try it: qoneqt-three.vercel.app
- Code: github.com/Vikashpatanvadiya/qoneqt
- Made with Pulse Studio · AI-generated videos are labelled

---

## Design tips
- One idea per slide, at most 4 short lines. Font size 28 or more, so it reads in a phone-sized video.
- Use the site's look: dark background, one accent colour, the NovaAI logo in a corner.
- Record at 1920x1080. Slide 4 is the diagram plus 5 steps; slide 7 is just the architecture diagram plus a title.
- Move from slide to browser with a simple cut. No PowerPoint transitions needed.
