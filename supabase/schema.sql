-- Qoneqt Pulse schema. Paste into the Supabase SQL editor and run once. Safe to re-run.

create table if not exists communities (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  name text not null,
  profile jsonb not null default '{}'   -- Community Brain
);

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  batch_id uuid,
  status text not null default 'queued',   -- queued | running | done | failed
  input_type text not null,                -- topic | trend | thread | idea
  input_text text not null,
  community_id uuid references communities(id),
  options jsonb not null default '{}',
  title text,
  video_url text,
  thumb_url text,
  duration_sec numeric,
  scores jsonb,      -- { script_v1, script_final, vision_avg }
  metrics jsonb,     -- { llm_calls, images, fallbacks, fixes, total_ms, stage_ms{} }
  error text,
  published_url text
);

create table if not exists stages (
  id bigint generated always as identity primary key,
  job_id uuid references jobs(id) on delete cascade,
  seq int not null,
  name text not null,       -- ingest | research | script | script_critic | direct | assets | vision_critic | render | upload
  status text not null,     -- pending | running | done | fixed | skipped | failed
  started_at timestamptz,
  ended_at timestamptz,
  summary text,
  reason text,
  output jsonb,
  retries int default 0
);

create index if not exists stages_job_id_idx on stages (job_id, seq);
create index if not exists jobs_created_at_idx on jobs (created_at desc);

alter table communities enable row level security;
alter table jobs enable row level security;
alter table stages enable row level security;

drop policy if exists "read communities" on communities;
drop policy if exists "read jobs" on jobs;
drop policy if exists "read stages" on stages;
create policy "read communities" on communities for select using (true);
create policy "read jobs" on jobs for select using (true);
create policy "read stages" on stages for select using (true);
-- no insert/update/delete policies: writes use the service role only

grant select on communities, jobs, stages to anon, authenticated;
grant all on communities, jobs, stages to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Public bucket for videos, thumbnails and stills
insert into storage.buckets (id, name, public)
values ('videos', 'videos', true)
on conflict (id) do update set public = true;

-- Login support (also in supabase/migrations/002_auth.sql)
alter table jobs add column if not exists user_id uuid references auth.users(id) on delete set null;
create index if not exists jobs_user_id_idx on jobs (user_id, created_at desc);
