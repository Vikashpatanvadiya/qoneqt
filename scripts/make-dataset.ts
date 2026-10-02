// Builds the Pulse-LM training set. Gemini is the teacher: it invents inputs for each community and writes
// the script + shot plan. Our own validators, duration governor and Script Critic then decide what is kept.
// Everything here is synthetic. No real posts or people are used.
//
//   npx tsx scripts/make-dataset.ts --target 300        generate until 300 raw examples exist, then export
//   npx tsx scripts/make-dataset.ts --export-only       re-export with a different --min-score
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { COMBINED_SYSTEM, combinedPrompt } from "../pipeline/agents/combined";
import { communityBlock, parseCommunityProfile } from "../pipeline/agents/community";
import { normalizeShotPlan } from "../pipeline/agents/director";
import { judge, runScriptCriticBatch } from "../pipeline/agents/scriptCritic";
import { config } from "../pipeline/config";
import { governScript } from "../pipeline/governor";
import { resolveEngine } from "../pipeline/providers";
import { ScriptSchema, ShotPlanSchema, StrictScriptSchema, scriptWordCount, type CommunityProfile, type Critique, type InputType, type Script, type ShotPlan } from "../pipeline/schemas";

const DIR = path.resolve("data/pulse-lm");
const RAW = path.join(DIR, "raw.jsonl");
const PER_CALL = 3;
const TEST_SIZE = 20;
const INPUT_TYPES: InputType[] = ["topic", "thread", "trend", "idea"];

type RawExample = {
  id: string;
  community: string;
  inputType: InputType;
  input: string;
  script: Script;
  plan: ShotPlan;
  teacherModel: string;
  valid: boolean;
  problems: string[];
  wordCount: number;
  estimatedSec: number;
  critique: Critique | null;
  overall: number | null;
};

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};

const TeacherSchema = z.object({
  examples: z.array(z.object({ input: z.string().describe("The input a user would paste"), script: ScriptSchema, plan: ShotPlanSchema })).min(1).max(PER_CALL),
});

const INPUT_GUIDE: Record<InputType, string> = {
  topic: "a short topic of 3 to 10 words",
  trend: "one or two lines describing something currently trending in this community",
  idea: "a rough video idea in one or two casual sentences, as a creator would type it",
  thread: "a realistic community thread: a title line, then 4 to 6 short messages from members with made-up first names who disagree or add to each other",
};

const TEACHER_SYSTEM = `You create training examples for a video planning model.
For each example you first INVENT a realistic input for the given community, then write the best possible answer to it.
Rules for the inputs: they must be different from each other and from the list of used titles. Never use real people, brands or organisations. Never include private details.
Rules for the answers, which the model will learn to copy:
${COMBINED_SYSTEM}
Every answer must follow these rules exactly. Make the hooks specific and surprising, never generic.
LENGTH IS CHECKED BY CODE AND SHORT SCRIPTS ARE THROWN AWAY: write 6 or 7 scenes with 11 to 15 narration words in each scene, so every script has 70 to 88 narration words in total. Count the words of each scene before you answer.`;

const readRaw = (): RawExample[] =>
  fs.existsSync(RAW)
    ? fs
        .readFileSync(RAW, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as RawExample)
    : [];

// The same checks the product runs: strict script rules, no governor fixes, no shot plan repairs, within the time budget.
function validate(script: Script, plan: ShotPlan) {
  const problems: string[] = [];
  const strict = StrictScriptSchema.safeParse(script);
  if (!strict.success) problems.push(...strict.error.issues.map((i) => i.message));
  const governed = governScript(script);
  if (governed.actions.length) problems.push(...governed.actions.map((a) => `governor: ${a.detail}`));
  const { plan: normalized, repairs } = normalizeShotPlan(plan, script);
  if (repairs.length) problems.push(...repairs.map((r) => `plan: ${r}`));
  if (plan.shots.length !== script.scenes.length) problems.push("plan: shot count does not match scene count");
  return { valid: problems.length === 0, problems, plan: normalized, wordCount: scriptWordCount(script), estimatedSec: Number(governed.estimatedSec.toFixed(1)) };
}

async function generate(target: number) {
  const { engine } = resolveEngine();
  const communities = (JSON.parse(fs.readFileSync(path.resolve("data/communities.json"), "utf8")) as Array<{ name: string }>).map((c) => parseCommunityProfile(c.name, c));
  let raw = readRaw();
  let failures = 0;
  let call = Math.floor(raw.length / PER_CALL);
  console.log(`Starting with ${raw.length} raw examples, target ${target}`);

  while (raw.length < target && failures < 5) {
    const community: CommunityProfile = communities[call % communities.length];
    const inputType = INPUT_TYPES[Math.floor(call / communities.length) % INPUT_TYPES.length];
    call++;
    const used = raw.filter((r) => r.community === community.name).map((r) => r.script.title).slice(-40);
    const prompt = `${communityBlock(community)}
${community.defaultStyle ? `Preferred visual style: ${community.defaultStyle}` : ""}

Write ${PER_CALL} examples. Each input is ${INPUT_GUIDE[inputType]} (input type "${inputType}").
Cover different subjects from the community's topics, and different emotions (curiosity, surprise, humor, debate, relatability, inspiration).
Titles already used, do not repeat these subjects: ${used.length ? used.join(" | ") : "none yet"}`;

    try {
      const res = await engine.llm.generateJson({ label: `teacher ${community.name}/${inputType}`, system: TEACHER_SYSTEM, prompt, schema: TeacherSchema, tier: "light" });
      const checked = res.data.examples.map((ex) => ({ ex, check: validate(ex.script, ex.plan) }));

      // Only valid examples are worth a critic call.
      const toScore = checked.filter((c) => c.check.valid);
      const reviews = toScore.length ? await runScriptCriticBatch(engine.llm, { scripts: toScore.map((c) => c.ex.script), communityProfile: community }).catch(() => toScore.map(() => null)) : [];

      const added: RawExample[] = checked.map(({ ex, check }) => {
        const critique = check.valid ? (reviews[toScore.findIndex((c) => c.ex === ex)] ?? null) : null;
        return {
          id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
          community: community.name,
          inputType,
          input: ex.input.trim(),
          script: ex.script,
          plan: check.plan,
          teacherModel: res.model,
          valid: check.valid,
          problems: check.problems,
          wordCount: check.wordCount,
          estimatedSec: check.estimatedSec,
          critique,
          overall: critique ? judge(critique, { minOverall: 0, minHook: 0 }).overall : null,
        };
      });
      fs.appendFileSync(RAW, added.map((a) => JSON.stringify(a)).join("\n") + "\n");
      raw = raw.concat(added);
      failures = 0;
      console.log(`[${raw.length}/${target}] ${community.name}/${inputType} via ${res.model}: ${added.map((a) => (a.valid ? (a.overall ?? "unscored") : "invalid")).join(", ")}`);
    } catch (err) {
      failures++;
      console.warn(`Teacher call failed (${failures}/5): ${(err as Error).message.slice(0, 200)}`);
    }
  }
  if (failures >= 5) console.warn("Stopped after 5 failed calls in a row. The free quota is probably used up. Run again later to continue.");
}

const profileOf = (name: string): CommunityProfile => {
  const all = JSON.parse(fs.readFileSync(path.resolve("data/communities.json"), "utf8")) as Array<{ name: string }>;
  return parseCommunityProfile(name, all.find((c) => c.name === name) ?? {});
};

// Chat format used by the fine-tuning notebook and by the Pulse-LM engine at run time.
const toChat = (r: RawExample) => ({
  messages: [
    { role: "system", content: COMBINED_SYSTEM },
    { role: "user", content: combinedPrompt({ inputType: r.inputType, content: r.input, communityProfile: profileOf(r.community) }) },
    { role: "assistant", content: JSON.stringify({ script: r.script, plan: r.plan }) },
  ],
});

function exportSets(minScore: number) {
  const raw = readRaw();
  const maxSec = config.video.maxSec() - config.video.outroSec;
  const seen = new Set<string>();
  const kept = raw.filter((r) => {
    const key = r.script.title.toLowerCase();
    if (!r.valid || r.overall === null || r.overall < minScore || r.estimatedSec > maxSec || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Held-out test set: spread evenly over communities, taken from the newest examples.
  const test: RawExample[] = [];
  const names = [...new Set(kept.map((k) => k.community))];
  const pools = names.map((n) => kept.filter((k) => k.community === n).reverse());
  for (let i = 0; test.length < Math.min(TEST_SIZE, Math.floor(kept.length / 4)); i++) {
    const pick = pools[i % pools.length].shift();
    if (pick) test.push(pick);
    if (pools.every((p) => p.length === 0)) break;
  }
  const rest = kept.filter((k) => !test.includes(k));
  const val = rest.filter((_, i) => i % 10 === 9);
  const train = rest.filter((_, i) => i % 10 !== 9);

  const write = (name: string, rows: RawExample[]) => fs.writeFileSync(path.join(DIR, name), rows.map((r) => JSON.stringify(toChat(r))).join("\n") + (rows.length ? "\n" : ""));
  write("train.jsonl", train);
  write("val.jsonl", val);
  write("test.jsonl", test);
  fs.writeFileSync(path.join(DIR, "test-inputs.json"), JSON.stringify(test.map((t) => ({ id: t.id, community: t.community, inputType: t.inputType, input: t.input, teacherScore: t.overall })), null, 2));

  const count = (rows: RawExample[], key: (r: RawExample) => string) => rows.reduce<Record<string, number>>((acc, r) => ({ ...acc, [key(r)]: (acc[key(r)] ?? 0) + 1 }), {});
  const scored = raw.filter((r) => r.overall !== null);
  const stats = {
    generatedAt: new Date().toISOString(),
    raw: raw.length,
    invalid: raw.filter((r) => !r.valid).length,
    scored: scored.length,
    averageScore: scored.length ? Number((scored.reduce((n, r) => n + (r.overall ?? 0), 0) / scored.length).toFixed(2)) : null,
    minScore,
    kept: kept.length,
    train: train.length,
    val: val.length,
    test: test.length,
    keptByCommunity: count(kept, (r) => r.community),
    keptByInputType: count(kept, (r) => r.inputType),
    teacherModels: count(raw, (r) => r.teacherModel),
    scoreHistogram: count(scored, (r) => String(Math.floor(r.overall ?? 0))),
  };
  fs.writeFileSync(path.join(DIR, "stats.json"), JSON.stringify(stats, null, 2));
  console.log(JSON.stringify(stats, null, 2));
}

async function main() {
  fs.mkdirSync(DIR, { recursive: true });
  if (!process.argv.includes("--export-only")) await generate(Number(arg("target", "300")));
  exportSets(Number(arg("min-score", "8")));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
