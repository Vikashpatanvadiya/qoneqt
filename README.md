# Pulse Studio

Turns a topic, trend, idea or a pasted community thread into a 30 to 45 second vertical video for the **Qoneqt Global Feed**, and checks its own work before the video is marked ready.

Built for CTRL FREAK 2026, the Qoneqt AI Challenge. Runs entirely on free tiers. Every video says "Made with Pulse Studio · AI-generated" on its end card.

- Live app: https://qoneqt-three.vercel.app
- Every job shows its agent timeline live: what each agent decided, why, which model it used, and what got fixed.

## How it works

```
Browser (Vite + React on Vercel)
  └─ POST /api/jobs ─ checks input, rate limits, stores the job in Supabase, starts a GitHub Action
GitHub Action (free runner, one per video, in parallel)
  └─ pipeline/run.ts
       1. Researcher       picks the angle most likely to get comments (uses the community's profile)
       2. Scriptwriter     hook, narration, on-screen text; length rules checked by code
       3. Script Critic    a different model scores it; up to 2 rewrites; every version kept
       4. Director         theme, palette, music mood and a shot plan for every scene
       5. Assets           voice (edge-tts), images (Pollinations FLUX, Cloudflare as backup), the creator's own uploads
       6. Vision Critic    renders a real frame of every scene and fixes wrong, broken or "AI-looking" images
       7. Render           Remotion, 1080x1920, 30 fps
       8. QA gate          code checks: duration, safe zones, contrast, loudness, silences, black frames, file size
  └─ video + thumbnail + stills to Supabase Storage
Browser polls Supabase and shows the timeline, script versions, storyboard, before/after frames and the video.
```

Every agent returns JSON that is validated with zod. Every external call retries with backoff and has a fallback, so a video always finishes: a failed image becomes a designed card, a rate-limited model hands over to the next one in its chain, and an unavailable critic is marked "skipped".

## Options on the Create page

| Option | Values | Default |
|---|---|---|
| Input | Topic, Trend, Community thread, Idea | Topic |
| Script | AI writes it, or **I have my own script** (with "Keep my words exactly") | AI |
| My media | Up to 10 images (JPG, PNG, WebP, 5 MB each). Place one with `[img2]` or `{{image:2}}` in your script; the rest are matched to scenes by meaning | none |
| Images in the video | Mixed (my images first, AI for the rest), Only my images, Only AI images | Mixed |
| Community | Any saved Community Brain profile | Qoneqt Global Feed |
| Engine | Cloud Gemini, or Pulse-LM (experimental, see below) | Cloud Gemini |
| Style | Auto (the Director picks a Style Pack and never repeats your last one), one of 8 packs, or the classic themes | Auto |
| Edit style | Creator (cuts every 1.5 to 3 s) or Classic (calmer). Style Packs bring their own pacing | Creator |
| Music | Auto (by the Director's mood), Upbeat, Calm, Dramatic, Inspiring, No music | Auto |
| Music volume | Low, Medium, High | Medium |
| Duck music under the voice | On, Off | On |
| Sound effects | Off, Low, Medium, High | Medium |
| Voice | Neerja (female), Prabhat (male), both en-IN | Neerja |
| Voice speed | Slower, Normal, Faster | Normal |
| Batch mode | One line per video, up to 10, rendered in parallel | off |

The options are stored in the job record, so every job can be reproduced.

### Your own voice
On Create, choose **Voice: My voiceover**, then record in the browser or upload MP3, M4A or WAV (up to 60 s). faster-whisper (MIT licence, base model, CPU) transcribes it with word timings. Your words become the script word for word, the captions follow your voice, and the AI voice is skipped. The light voice polish still applies.

### Edit after rendering (Canva-style)
Every new video saves its render inputs. **Edit video** on the Job page opens an editor with a live in-browser preview (Remotion Player) and a scene strip. You can:
- cut scenes and move them earlier or later,
- change the on-screen text,
- change a narration line (it is re-voiced and re-captioned on render; not possible for your own voiceover),
- turn a scene into a text card,
- upload a replacement image, or describe a new AI image.

Text, order, cuts, cards and uploads show in the preview immediately. **Render edited version** creates a new video from the original's files and skips the agents, about a minute of rendering. Videos made before this feature cannot be edited.

### Accounts, guests and posting
- **Guests:** no account needed to try it. A guest gets one video per network per day (`GUEST_VIDEOS_PER_DAY`), no batch mode.
- **Log in** (Supabase email and password) to:
  - make more videos (normal rate limits apply),
  - use batch mode,
  - see "My videos",
  - delete your own videos (video, frames and record).
- **Post on Qoneqt:** Qoneqt has no public posting API. The Job page gives three steps instead: download the MP4, copy the caption, and open `qoneqt.com/create` (Create Qlip, then Video).

### Your own script
With "Keep my words exactly" on, code splits the script at sentence ends into 5 to 8 scenes. The model only adds on-screen text, scene roles, a title and a caption. The Script Critic gives advice but never changes your words. Long scripts are never cut; the voice is sped up by at most 18% and anything still over 45 s is flagged.

### Your own images
Images are re-encoded in the browser before upload, which removes EXIF and location data. They go straight to Supabase Storage through a signed URL from `/api/uploads`. Only upload images you have the right to use: the video may be public. Your images are never regenerated by the Vision Critic; only their text contrast can be fixed. Wide images are shown whole on a blurred fill instead of being cropped.

## Style Packs: every video looks different

A Style Pack is the whole look of a video in one object (`src/styles/packs/*.ts`):
- fonts (at most 2 per pack),
- palette and caption style, position and animation,
- camera feel, zoom range, shot length and transition set,
- image grade, grain, vignette and overlay,
- which layout each scene gets, the sound-effect profile and the allowed music moods.

| Pack | Looks like | Captions |
|---|---|---|
| Lab Notes | near-black, mono figure labels, thin coral serif numbers, growing bar charts | 1 to 2 words, plain, centre |
| Studio Ad | charcoal, stacked rounded panels, cream cards with drawing arcs | white on a red pill |
| Explainer UI | navy UI cards, uppercase heading with an accent second line, picture-in-picture | white in a cyan box |
| Highlighter Doc | soft grey page, serif headline, yellow marker sweep, white pills on blue | plain, short groups |
| Bold Poster | white poster, heavy condensed caps, blue blocks, hard cuts | black bar |
| Portrait Mono | grayscale photos, typewriter name tags, huge blurred type behind | plain, small |
| Creator Pop | outlined heavy type, full-bleed hook, emoji pops, handheld punch-ins | kinetic, yellow keywords |
| Handwritten Journal | ruled paper, taped polaroids, scribbled underlines | handwritten note strip |

How a pack is chosen:
1. The pick on the Create page wins.
2. Otherwise the Director picks one for the topic, community and emotion.
3. If that repeats the same user's previous pack, code picks the best other pack for the emotion.

The pack is locked right after the Director, so vision fixes, retries and later edits keep the same look. The Vision Critic also reports whether each frame matches the pack. The Job page shows the pack, its fonts, palette swatches and caption style, and Library cards carry a pack badge.

The packs come from editing techniques noted in seven public Shorts (`docs/style-library.md`). No footage or text was copied. All fonts are OFL (`docs/FONT-LICENSES.md`). Videos made before packs keep their original theme.

## What makes it look edited, not generated

- **Rhythm:** each scene is cut into 2 or 3 beats on word boundaries (wide and tight crops of the same image, a big emphasis-word card, a punch-zoomed re-cut of a card).
- **Camera:** eased moves of 3 to 8%, a subtle handheld drift, and a quick punch-in on emphasis words.
- **Transitions:** slide, wipe, flip and fade, never the same one more than twice in a row, and a light flash on the twist.
- **Captions:** 2 to 4 words at a time with a heavy outline, spring pop-in, highlighted keywords, inside the app safe zones.
- **Eight Style Packs** (above), each with its own fonts, colours, layouts, motion and colour grade. The older five themes still render videos made before packs.
- **Images:** documentary-style prompts (natural light, 35 mm, muted colours, no close-up faces or hands), one grade per theme with grain and vignette, and an "AI look" check that regenerates plastic or uncanny images.
- **Sound:**
  - Effects synthesized in code with ffmpeg, so there are no licence questions: whoosh on transitions, pop on emphasis, riser and hit on the hook and twist, ticks under counting numbers.
  - Music is a crossfaded bed with a random start, ducked about 14 dB under the voice.
  - The voice gets a light polish (high-pass, de-ess, compression, presence) and speech-friendly text ("₹300" is read as "300 rupees").
  - Final mix at -14 LUFS, true peak below -1 dB.

## Pulse-LM (our own model, experimental)

Qwen3-4B-Instruct (Apache 2.0) fine-tuned with LoRA on 106 synthetic examples. Gemini wrote the examples as the teacher; our validators and Script Critic kept only those scoring 8 or more. Notebook: `notebooks/pulse_lm_finetune.ipynb`, data: `data/pulse-lm/`. Results on 20 held-out inputs (`data/pulse-lm/eval.md`):

| | Pulse-LM | Gemini Flash Lite |
|---|---|---|
| Valid JSON (after code repairs) | 100% | 100% |
| Answers needing a code repair | 85% | 0% |
| Length rules respected | 55% | 5% |
| Script Critic score | 6.6 | 7.41 |
| Seconds per plan (laptop) | 82 | 4 |

It did not meet our own bar (90% length compliance), so it stays an experimental engine and Gemini is the default.

## Run it yourself

```bash
npm install
uv venv --python 3.12 .venv && uv pip install --python .venv/bin/python -r pipeline/requirements.txt
cp .env.example .env   # fill in your keys
npm run gen -- "Why nobody replies in group chats anymore"   # local video in out/video.mp4
npm run dev:web        # the web app on http://localhost:5173
```

Cloud setup:
1. **Supabase:** run `supabase/schema.sql` in the SQL editor.
2. **GitHub:** add the secrets `GEMINI_API_KEY`, `CF_ACCOUNT_ID`, `CF_API_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` and `POLLINATIONS_TOKEN`, plus the model chain variables (see `.env.example`).
3. **Vercel:** import the repo and set `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `GH_PAT`, `GH_OWNER`, `GH_REPO`, `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

## Honest limits

- **Speed:** each video takes about 3 to 6 minutes, most of it starting the free GitHub runner and rendering. There is no always-on server.
- **Free quotas:**
  - Gemini 3.5 Flash allows 20 requests a day, so the engine falls back through a chain of other Gemini and Gemma models.
  - Cloudflare's 10,000 daily neurons ran out faster than the pricing page suggested, so Pollinations is the first image source.
  - Quotas reset at 5:30 AM IST.
- **Voice:** free neural TTS. It is clear but not a human voice.
- **Images:** Pollinations returns at most 768x1280, upscaled to 1080x1920.
- **Not built:**
  - Stock footage (Pexels: no key available during the hackathon).
  - Per-image controls for focal point and Ken Burns direction.
  - Face detection to keep captions off faces.
  - Lip-sync.
- **GitHub Actions** is meant for CI. We use it as a render worker for this demo and keep usage light.

## Data and privacy

The repo holds only synthetic training data and aggregated community style guides. Raw posts, profile links and personal photos are kept out of it (`data/private/`, `Images/` are gitignored).
