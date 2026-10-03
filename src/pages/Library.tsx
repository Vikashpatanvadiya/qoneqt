import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ago, score, seconds } from "../lib/format";
import { supabase } from "../lib/supabase";
import { JOB_COLUMNS, type JobRow } from "../lib/types";
import { useAuth } from "../lib/auth";
import { Chip, Empty, SectionTitle, StatusPill } from "../components/ui";

export function LibraryPage() {
  const [params] = useSearchParams();
  const batch = params.get("batch");
  const { session, ready } = useAuth();
  const mine = params.get("mine") === "1" && session ? session.user.id : null;
  const [jobs, setJobs] = useState<JobRow[] | null>(null);

  useEffect(() => {
    let stop = false;
    let timer: number | undefined;
    const load = async () => {
      let q = supabase.from("jobs").select(JOB_COLUMNS).order("created_at", { ascending: false }).limit(60);
      q = batch ? q.eq("batch_id", batch) : mine ? q.eq("user_id", mine) : q.eq("status", "done");
      const { data } = await q;
      if (stop) return;
      const rows = (data as JobRow[]) ?? [];
      setJobs(rows);
      // A batch keeps updating until every video in it has finished.
      if (batch && rows.some((r) => r.status === "queued" || r.status === "running")) timer = window.setTimeout(load, 3000);
    };
    load();
    return () => {
      stop = true;
      window.clearTimeout(timer);
    };
  }, [batch, mine, ready]);

  const done = jobs?.filter((j) => j.status === "done").length ?? 0;
  return (
    <div>
      <SectionTitle right={batch ? <Link to="/library" className="text-sm text-muted hover:text-ink">All videos →</Link> : null}>
        {batch ? `Batch: ${done} of ${jobs?.length ?? 0} ready` : mine ? "My videos" : "Library"}
      </SectionTitle>
      {jobs === null ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <div key={i} className="aspect-[9/16] animate-pulse rounded-3xl bg-card" />)}</div>
      ) : jobs.length === 0 ? (
        <Empty>No videos yet. <Link to="/" className="text-amber">Create the first one</Link>.</Empty>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {jobs.map((j) => (
            <Link key={j.id} to={`/jobs/${j.id}`} className="group overflow-hidden rounded-3xl border border-white/[0.04] bg-card transition hover:border-white/15">
              <div className="relative aspect-[9/16] bg-surface">
                {j.thumb_url ? <img src={j.thumb_url} alt="" className="h-full w-full object-cover" loading="lazy" /> : null}
                {j.metrics?.pack?.name ? <span className="absolute bottom-2 left-2 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">{j.metrics.pack.name}</span> : null}
                <span className="absolute left-3 top-3"><StatusPill status={j.status === "done" ? "done" : j.status === "failed" ? "failed" : j.status === "running" ? "running" : "queued"} /></span>
              </div>
              <div className="space-y-2 p-4">
                <div className="line-clamp-2 font-semibold leading-snug">{j.title ?? j.input_text}</div>
                <div className="flex flex-wrap gap-1.5">
                  {j.duration_sec ? <Chip>{Number(j.duration_sec).toFixed(0)}s</Chip> : null}
                  {j.scores?.script_final != null ? <Chip tone="accent">script {score(j.scores.script_final)}</Chip> : null}
                  {j.scores?.vision_avg != null ? <Chip tone="good">vision {score(j.scores.vision_avg)}</Chip> : null}
                </div>
                <div className="text-xs text-faint">{ago(j.created_at)}{j.metrics?.total_ms ? ` · made in ${seconds(j.metrics.total_ms)}` : ""}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
