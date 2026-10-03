import { Card, SectionTitle } from "../components/ui";

const STEPS = [
  ["Researcher", "Reads the topic, trend or pasted community thread with the community's profile, writes three angles and picks the one most likely to make people stop and comment."],
  ["Scriptwriter", "Writes the hook, narration and on-screen text in the community's tone. Length rules are checked by code, not trusted to the model."],
  ["Script Critic", "A different model scores hook, clarity, pacing, community fit and retention. Below the bar, the script goes back for up to two rewrites. Every version is kept."],
  ["Director", "Plans every shot: AI image or designed card, camera move, transition, caption style, emphasis words, palette and music."],
  ["Assets", "Images from FLUX, voice from edge-tts. The real voice length decides the timing, and a governor trims anything over 45 seconds."],
  ["Vision Critic", "Renders a real frame of every scene, captions included, and a vision model judges it. Wrong or broken images are regenerated, or replaced with a designed card."],
  ["Render and QA", "Remotion builds the 1080x1920 video. Code then checks duration, safe zones, text contrast, loudness, silences, black frames and file size, and fixes what it can."],
];

const STACK = [
  ["LLM and vision", "Gemini 3.x on the free tier, with a chain of fallback models"],
  ["Our own model", "Pulse-LM: Qwen3-4B fine-tuned with LoRA on 106 synthetic, critic-filtered examples. Experimental"],
  ["Images", "Cloudflare Workers AI, FLUX.1 schnell"],
  ["Voice", "edge-tts with word timings"],
  ["Video", "Remotion (React)"],
  ["Workers", "GitHub Actions, one run per video, in parallel"],
  ["Data", "Supabase Postgres and Storage"],
  ["Web", "Vite, React, Tailwind on Vercel"],
];

export function HowItWorksPage() {
  return (
    <div className="space-y-14">
      <section>
        <h1 className="text-4xl font-semibold sm:text-5xl">How the Pulse Engine works</h1>
        <p className="mt-3 max-w-2xl text-muted">A repeatable pipeline, not a single generation. Every agent returns strict JSON that code validates, and every step is logged so you can see why each decision was made.</p>
      </section>
      <section>
        <SectionTitle>The agents</SectionTitle>
        <ol className="grid gap-4 md:grid-cols-2">
          {STEPS.map(([title, body], i) => (
            <li key={title}>
              <Card className="h-full">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand font-display text-sm font-semibold text-[#141414]">{i + 1}</span>
                  <h3 className="text-xl font-semibold">{title}</h3>
                </div>
                <p className="mt-3 text-[15px] leading-relaxed text-muted">{body}</p>
              </Card>
            </li>
          ))}
        </ol>
      </section>
      <section>
        <SectionTitle>Built with</SectionTitle>
        <Card className="divide-y divide-line p-0 sm:p-0">
          {STACK.map(([k, v]) => (
            <div key={k} className="flex flex-col gap-1 px-5 py-3.5 text-sm sm:flex-row sm:gap-6">
              <span className="w-40 shrink-0 font-semibold">{k}</span>
              <span className="text-muted">{v}</span>
            </div>
          ))}
        </Card>
        <p className="mt-4 text-xs text-faint">Everything runs on free tiers. GitHub Actions is meant for CI; we use it as a render worker for this hackathon demo and keep usage light.</p>
      </section>
    </div>
  );
}
