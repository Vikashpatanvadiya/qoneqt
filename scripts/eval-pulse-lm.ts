// Compares Pulse-LM with Gemini on the 20 held-out inputs. Both get the same single-call planner prompt.
// Measures: valid JSON, length rules respected, shot plan needing no repair, Script Critic score, speed.
//   npx tsx scripts/eval-pulse-lm.ts            -> data/pulse-lm/eval.json and eval.md
import fs from "node:fs";
import path from "node:path";
import { COMBINED_SYSTEM, CombinedSchema, combinedPrompt, type Combined } from "../pipeline/agents/combined";
import { parseCommunityProfile } from "../pipeline/agents/community";
import { normalizeShotPlan } from "../pipeline/agents/director";
import { judge, runScriptCriticBatch } from "../pipeline/agents/scriptCritic";
import { config } from "../pipeline/config";
import { governScript } from "../pipeline/governor";
import { geminiLlm } from "../pipeline/providers/llm";
import { runPulsePlanner } from "../pipeline/providers/pulseLm";
import { StrictScriptSchema, scriptWordCount, type CommunityProfile, type InputType } from "../pipeline/schemas";

const DIR = path.resolve("data/pulse-lm");
type TestInput = { id: string; community: string; inputType: InputType; input: string };
type Row = {
  id: string;
  community: string;
  inputType: InputType;
  engine: "pulse-lm" | "gemini";
  model: string;
  validJson: boolean;
  firstTryValid: boolean;
  lengthOk: boolean;
  planOk: boolean;
  words: number | null;
  estimatedSec: number | null;
  seconds: number;
  tokensPerSec: number | null;
  score: number | null;
  hook: string | null;
  problems: string[];
  output: Combined | null;
};

const communities = JSON.parse(fs.readFileSync(path.resolve("data/communities.json"), "utf8")) as Array<{ name: string }>;
const profileOf = (name: string): CommunityProfile => parseCommunityProfile(name, communities.find((c) => c.name === name) ?? {});

function check(output: Combined) {
  const strict = StrictScriptSchema.safeParse(output.script);
  const governed = governScript(output.script);
  const { repairs } = normalizeShotPlan(output.plan, output.script);
  const problems = [...(strict.success ? [] : strict.error.issues.map((i) => i.message)), ...governed.actions.map((a) => `governor: ${a.detail}`), ...repairs.map((r) => `plan: ${r}`)];
  return { lengthOk: strict.success && governed.actions.length === 0, planOk: repairs.length === 0, words: scriptWordCount(output.script), estimatedSec: Number(governed.estimatedSec.toFixed(1)), problems };
}

const empty = (t: TestInput, engine: Row["engine"], model: string, seconds: number, error: string): Row => ({
  id: t.id, community: t.community, inputType: t.inputType, engine, model, validJson: false, firstTryValid: false, lengthOk: false, planOk: false,
  words: null, estimatedSec: null, seconds, tokensPerSec: null, score: null, hook: null, problems: [error], output: null,
});

async function main() {
  const tests = JSON.parse(fs.readFileSync(path.join(DIR, "test-inputs.json"), "utf8")) as TestInput[];
  const rows: Row[] = [];

  for (const [i, t] of tests.entries()) {
    const input = { inputType: t.inputType, content: t.input, communityProfile: profileOf(t.community) };

    let start = Date.now();
    try {
      const res = await runPulsePlanner(input);
      rows.push({ id: t.id, community: t.community, inputType: t.inputType, engine: "pulse-lm", model: res.model, validJson: true, firstTryValid: res.attempts.length === 1, ...check(res.data), seconds: (Date.now() - start) / 1000, tokensPerSec: Number(res.tokensPerSec.toFixed(1)), score: null, hook: res.data.script.hook, output: res.data });
    } catch (err) {
      rows.push(empty(t, "pulse-lm", config.pulseLm.model(), (Date.now() - start) / 1000, (err as Error).message.slice(0, 200)));
    }

    start = Date.now();
    try {
      const res = await geminiLlm.generateJson({ label: "gemini planner", system: COMBINED_SYSTEM, prompt: combinedPrompt(input), schema: CombinedSchema, tier: "light" });
      rows.push({ id: t.id, community: t.community, inputType: t.inputType, engine: "gemini", model: res.model, validJson: true, firstTryValid: res.attempts.length === 1, ...check(res.data), seconds: (Date.now() - start) / 1000, tokensPerSec: null, score: null, hook: res.data.script.hook, output: res.data });
    } catch (err) {
      rows.push(empty(t, "gemini", "gemini", (Date.now() - start) / 1000, (err as Error).message.slice(0, 200)));
    }
    const [p, g] = rows.slice(-2);
    console.log(`[${i + 1}/${tests.length}] ${t.community}/${t.inputType}: pulse-lm ${p.validJson ? `${p.words}w ${p.seconds.toFixed(0)}s` : "FAILED"} | gemini ${g.validJson ? `${g.words}w ${g.seconds.toFixed(0)}s` : "FAILED"}`);
  }

  // The same Script Critic scores both engines. Scripts are mixed in each batch, so it does not know which engine wrote which.
  for (const name of [...new Set(rows.map((r) => r.community))]) {
    const pending = rows.filter((r) => r.community === name && r.output);
    for (let i = 0; i < pending.length; i += 3) {
      const batch = pending.slice(i, i + 3);
      const reviews = await runScriptCriticBatch(geminiLlm, { scripts: batch.map((b) => b.output!.script), communityProfile: profileOf(name) }).catch(() => batch.map(() => null));
      batch.forEach((b, j) => {
        const review = reviews[j];
        b.score = review ? judge(review, { minOverall: 0, minHook: 0 }).overall : null;
      });
    }
    console.log(`scored ${name}`);
  }

  const summarize = (engine: Row["engine"]) => {
    const all = rows.filter((r) => r.engine === engine);
    const valid = all.filter((r) => r.validJson);
    const scored = valid.filter((r) => r.score !== null);
    const avg = (list: number[]) => (list.length ? Number((list.reduce((a, b) => a + b, 0) / list.length).toFixed(2)) : null);
    const pct = (n: number) => Number(((n / all.length) * 100).toFixed(0));
    return {
      engine,
      models: [...new Set(all.map((r) => r.model))],
      inputs: all.length,
      validJsonPct: pct(valid.length),
      firstTryValidPct: pct(all.filter((r) => r.firstTryValid).length),
      lengthOkPct: pct(all.filter((r) => r.lengthOk).length),
      planOkPct: pct(all.filter((r) => r.planOk).length),
      avgWords: avg(valid.map((r) => r.words!)),
      avgScore: avg(scored.map((r) => r.score!)),
      scored: scored.length,
      avgSeconds: avg(all.map((r) => r.seconds)),
      avgTokensPerSec: avg(all.filter((r) => r.tokensPerSec).map((r) => r.tokensPerSec!)),
    };
  };
  const pulse = summarize("pulse-lm");
  const gemini = summarize("gemini");
  const gap = pulse.avgScore !== null && gemini.avgScore !== null ? Number((gemini.avgScore - pulse.avgScore).toFixed(2)) : null;
  const decision = {
    rule: "valid JSON >= 95%, length respected >= 90%, critic score within about 1 point of Gemini",
    validJson: pulse.validJsonPct >= 95,
    length: pulse.lengthOkPct >= 90,
    score: gap !== null && gap <= 1,
    scoreGap: gap,
  };
  const result = { ranAt: new Date().toISOString(), machine: "local laptop (Apple M1, 8 GB)", note: "Pulse-LM runs in plain JSON mode, with no schema grammar. Our zod schema validates the result.", pulse, gemini, decision, rows: rows.map(({ output, ...r }) => r) };
  fs.writeFileSync(path.join(DIR, "eval.json"), JSON.stringify(result, null, 2));
  fs.writeFileSync(path.join(DIR, "eval-outputs.json"), JSON.stringify(rows.map((r) => ({ id: r.id, engine: r.engine, output: r.output })), null, 2));

  const line = (label: string, a: unknown, b: unknown) => `| ${label} | ${a ?? "n/a"} | ${b ?? "n/a"} |`;
  const md = [
    "# Pulse-LM vs Gemini on 20 held-out inputs",
    "",
    `Run: ${result.ranAt} on ${result.machine}. Both engines got the same single-call planner prompt. ${result.note}`,
    "",
    `| Metric | Pulse-LM (${pulse.models.join(", ")}) | Gemini (${gemini.models.join(", ")}) |`,
    "|---|---|---|",
    line("Valid JSON", `${pulse.validJsonPct}%`, `${gemini.validJsonPct}%`),
    line("Valid on the first try", `${pulse.firstTryValidPct}%`, `${gemini.firstTryValidPct}%`),
    line("Length rules respected", `${pulse.lengthOkPct}%`, `${gemini.lengthOkPct}%`),
    line("Shot plan needed no repair", `${pulse.planOkPct}%`, `${gemini.planOkPct}%`),
    line("Average narration words", pulse.avgWords, gemini.avgWords),
    line("Average Script Critic score", pulse.avgScore, gemini.avgScore),
    line("Average seconds per plan", pulse.avgSeconds, gemini.avgSeconds),
    line("Tokens per second", pulse.avgTokensPerSec, "n/a"),
    "",
    `Decision rule: ${decision.rule}.`,
    `Result: valid JSON ${decision.validJson ? "met" : "not met"}, length ${decision.length ? "met" : "not met"}, score ${decision.score ? "met" : "not met"} (gap ${gap}).`,
    "",
  ].join("\n");
  fs.writeFileSync(path.join(DIR, "eval.md"), md);
  console.log("\n" + md);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
