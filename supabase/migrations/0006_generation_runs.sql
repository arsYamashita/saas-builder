create table if not exists generation_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  template_key text not null,
  status text not null default 'running',
  current_step text,
  steps_json jsonb not null default '[]'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists idx_generation_runs_project_id
  on generation_runs(project_id);
