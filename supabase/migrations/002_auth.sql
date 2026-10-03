-- Login support: each job can belong to a signed-in user. Run once in the Supabase SQL editor. Safe to re-run.
alter table jobs add column if not exists user_id uuid references auth.users(id) on delete set null;
create index if not exists jobs_user_id_idx on jobs (user_id, created_at desc);
