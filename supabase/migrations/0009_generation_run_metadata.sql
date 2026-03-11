-- Add provider/model tracking and review status to generation_runs
alter table generation_runs
  add column if not exists provider text,
  add column if not exists model text,
  add column if not exists review_status text not null default 'pending',
  add column if not exists reviewed_at timestamptz,
  add column if not exists promoted_at timestamptz,
  add column if not exists baseline_tag text;
