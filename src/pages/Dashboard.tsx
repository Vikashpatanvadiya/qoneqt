import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { avg, score, seconds } from "../lib/format";
import { supabase } from "../lib/supabase";
import { JOB_COLUMNS, type JobRow } from "../lib/types";
import { Card, SectionTitle, Stat } from "../components/ui";

// Cloudflare Workers AI rate per 1,000 neurons above the free tier, from their pricing page (2 Oct 2026). Estimate only.
const USD_PER_1000_NEURONS = 0.011;

export function DashboardPage() {
  const [jobs, setJobs] = useState<JobRow[] | null>(null);
  useEffect(() => {
    supabase.from("jobs").select(JOB_COLUMNS).order("created_at", { ascending: false }).limit(500).then(({ data }) => setJobs((data as JobRow[]) ?? []));
  }, []);

  if (!jobs) return <div className="h-40 animate-pulse rounded-3xl bg-card" />;
  const done = jobs.filter((j) => j.status === "done");
  // Jobs that failed before reaching a worker (missing settings during setup) say nothing about the pipeline, so they are counted separately.
  const setupError = (j: JobRow) => j.status === "failed" && /^Missing env var|GitHub dispatch failed/.test(j.error ?? "");
  const finished = jobs.filter((j) => (j.status === "done" || j.status === "failed") && !setupError(j));
  const setupErrors = jobs.filter(setupError).length;
  const m = (j: JobRow, key: string) => (typeof j.metrics?.[key] === "number" ? (j.metrics[key] as number) : 0);
  const sum = (key: string) => done.reduce((n, j) => n + m(j, key), 0);
  const neurons = sum("neurons_est");

  return (
    <div className="space-y-12">
      <section>
        <h1 className="text-4xl font-semibold sm:text-5xl">Proof of scale</h1>
        <p className="mt-3 max-w-2xl text-muted">Live numbers from every job in the database. Nothing here is typed in by hand.</p>
      </section>
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Videos made" value={done.length} hint={`${jobs.length} jobs started`} />
        <Stat label="Average time per video" value={seconds(avg(done.map((j) => j.metrics?.total_ms)))} hint="request to ready, on free runners" />
        <Stat label="Average script score" value={score(avg(done.map((j) => j.scores?.script_final)))} hint={`first drafts: ${score(avg(done.map((j) => j.scores?.script_v1)))}`} />
        <Stat label="Average vision score" value={score(avg(done.map((j) => j.scores?.vision_avg)))} hint="frames checked by the Vision Critic" />
        <Stat label="Scenes fixed by the Vision Critic" value={sum("vision_fixes")} />
        <Stat label="Problems fixed on their own" value={sum("fixes")} hint="script revisions, length fixes, vision and QA fixes" />
        <Stat label="Success rate" value={finished.length ? `${Math.round((done.length / finished.length) * 100)}%` : "–"} hint={`${finished.length - done.length} failed in the pipeline${setupErrors ? `, ${setupErrors} setup errors before launch not counted` : ""}`} />
        <Stat label="Cost to us" value="₹0" hint={`free tiers · images would cost about $${((neurons / 1000) * USD_PER_1000_NEURONS).toFixed(2)} at paid rates`} />
      </section>
      <section>
        <SectionTitle>Recent jobs</SectionTitle>
        <Card className="overflow-x-auto p-0 sm:p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th className="px-5 py-4 font-medium">Video</th>
                <th className="px-3 py-4 font-medium">Status</th>
                <th className="px-3 py-4 font-medium">Time</th>
                <th className="px-3 py-4 font-medium">Script</th>
                <th className="px-3 py-4 font-medium">Vision</th>
                <th className="px-5 py-4 font-medium">Fixes</th>
              </tr>
            </thead>
            <tbody>
              {jobs.slice(0, 25).map((j) => (
                <tr key={j.id} className="border-t border-line">
                  <td className="max-w-xs truncate px-5 py-3"><Link to={`/jobs/${j.id}`} className="hover:text-amber">{j.title ?? j.input_text}</Link></td>
                  <td className="px-3 py-3 capitalize text-muted">{j.status}</td>
                  <td className="px-3 py-3 tabular-nums">{seconds(j.metrics?.total_ms)}</td>
                  <td className="px-3 py-3 tabular-nums">{j.scores?.script_v1 != null ? `${score(j.scores.script_v1)} → ${score(j.scores.script_final)}` : "–"}</td>
                  <td className="px-3 py-3 tabular-nums">{score(j.scores?.vision_avg)}</td>
                  <td className="px-5 py-3 tabular-nums">{j.metrics?.fixes ?? "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>
    </div>
  );
}
