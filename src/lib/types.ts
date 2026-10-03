// Row shapes as stored in Supabase. Stage outputs are JSON written by the pipeline, read defensively.
export type JobStatus = "queued" | "running" | "done" | "failed";

export type JobRow = {
  id: string;
  created_at: string;
  batch_id: string | null;
  status: JobStatus;
  input_type: string;
  input_text: string;
  community_id: string | null;
  options: Record<string, unknown> | null;
  title: string | null;
  video_url: string | null;
  thumb_url: string | null;
  duration_sec: number | null;
  scores: { script_v1?: number | null; script_final?: number | null; vision_avg?: number | null } | null;
  metrics: Record<string, any> | null;
  error: string | null;
  user_id?: string | null;
};

export type StageStatus = "pending" | "running" | "done" | "fixed" | "skipped" | "failed";

export type StageRow = {
  id: number;
  job_id: string;
  seq: number;
  name: string;
  status: StageStatus;
  started_at: string | null;
  ended_at: string | null;
  summary: string | null;
  reason: string | null;
  output: any;
  retries: number | null;
};

export type CommunityRow = { id: string; name: string; profile: Record<string, any> };

// "*" so the app keeps working whether or not the login migration (user_id) has been run.
export const JOB_COLUMNS = "*";
