# Demo video script (target 3:30, voiceover)

About 450 spoken words; with pauses for the screen this lands near 3:30, a calm pace of 140 to 150 words per minute. **[Brackets]** are what to show on screen. Numbers in `{curly braces}` come from your Dashboard on the day you record.

Diagrams for Part 2 and Part 3 are in `docs/diagrams/`. Open the `.excalidraw` files on excalidraw.com (menu → Open) to present them, or use the `.png` exports directly in your edit.

Before recording:
- Start one live video about 5 minutes earlier (Style: Auto), so its Job page is complete when you reach it.
- Keep a finished video from the Library ready as a backup.
- Don't use batch mode while recording; it can hit the free per-minute limit.

---

## 0:00 to 0:15: Hook
**[Full screen: your best finished video, the first 6 to 8 seconds with sound.]**

> This video was written, voiced, edited and checked by AI. This is Qoneqt Pulse.

## 0:15 to 1:15: Part 1, project walkthrough
**[Create page on the live site.]**

> Qoneqt Pulse turns a topic, a trend, an idea or a pasted community thread into a 30 to 45 second vertical video for the Qoneqt Global Feed.
> I pick a community; its Community Brain holds its tone, words and best hooks. AI can write the script, or I paste my own, record my own voice, or add my own images.

**[Scroll to the Style grid. Hover two or three packs. Leave it on Auto.]**

> Every video gets its own look: eight Style Packs with their own fonts, colours, captions and motion, never the same one twice in a row.

**[Open the live video's Job page. Scroll the agent timeline.]**

> Every step appears live: what each agent decided, and why.

**[Play the finished video for 3 to 4 seconds. Then click Edit video: cut a scene, change a line of text.]**

> The editor works like Canva: cut scenes, change text, swap an image, render again.

**[Library: show the pack badges. Then the Post on Qoneqt panel.]**

> Then I download it with its caption and post it on Qoneqt.

## 1:15 to 2:20: Part 2, the LLM system
**[Diagram 1: `1-pulse-engine.png`. Point to each box as you name it.]**

> The LLM system is the Pulse Engine: five AI agents that check each other.
> The **Researcher** writes three angles and picks the one most likely to get comments.
> The **Scriptwriter** writes the hook and five to eight scenes.
> The **Script Critic**, a different model, scores the hook, clarity, pacing and community fit. Below our bar, the script is rewritten, up to twice.

**[Job page: Script versions, v1 → v2 with scores.]**

> The **Director** picks the Style Pack and plans every shot.
> The **Vision Critic** looks at real rendered frames, and regenerates any picture that is wrong, broken or looks fake.

**[Job page: Vision before / after.]**

> Every agent answers in strict JSON, validated in code. If a model hits its limit, the engine switches to the next one, so the video still finishes.

**[Diagram 2: `2-pulse-lm.png`.]**

> We also fine-tuned our own model, Pulse-LM: Gemini wrote 450 plans, our critic kept the best 137, and we trained Qwen3 4B with LoRA on a free Colab GPU. It scored 6.6 against Gemini's 7.4, so it stays an experimental engine.

## 2:20 to 2:50: Part 3, tech stack and resources
**[Diagram 3: `3-architecture.png`.]**

> React and Tailwind on Vercel. Each video renders on its own GitHub Actions runner, so ten render in parallel.
> Gemini 3 Flash models write and review, FLUX makes images, edge-tts speaks, faster-whisper transcribes your voice, Remotion renders, and Supabase stores everything.
> All on free tiers, with our laptop switched off.

## 2:50 to 3:30: Part 4, relevance and impact
**[Back to the Create page, or the Dashboard.]**

> The brief asked for a repeatable pipeline, not a single generation. Input: topics, trends and community threads. Engine: five agents that check their own work. Output: a publish-ready vertical video. Ship: deployed, with batch mode for scale.

**[Dashboard numbers. Then your video live on the Qoneqt Global Feed.]**

> So far: `{videos made}` videos, about `{average time}` minutes each, average script score `{average score}`, `{scenes auto-fixed}` scenes fixed automatically, at zero rupees per video.
> For Qoneqt, every community and creator can post on-brand video daily, without a production team.

**[End on the Qoneqt post, or a 2-second logo card.]**

> Qoneqt Pulse. Community conversations in, Global Feed videos out.

---

## Recording tips
- Record the screen first, then the voice over it. Do 2 takes and keep the calmer one.
- Zoom the browser to 110 to 125% so text is readable in the recording.
- If the live job fails during recording, cut to a finished Job page and say the fallback line from Part 2. That still shows the reliability.
- Final length 3:15 to 3:45. The form says 2 to 4 minutes and the guidelines say 3 to 4, so stay above 3:00.
