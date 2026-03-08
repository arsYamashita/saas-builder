create table if not exists implementation_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  blueprint_id uuid not null references blueprints(id) on delete cascade,
  run_type text not null,
  version int not null default 1,
  status text not null default 'completed',
  prompt_text text,
  output_text text not null,
  output_json jsonb,
  source text not null default 'claude',
  created_at timestamptz not null default now()
);

create index if not exists idx_implementation_runs_project_id
  on implementation_runs(project_id);

create index if not exists idx_implementation_runs_blueprint_id
  on implementation_runs(blueprint_id);

create index if not exists idx_implementation_runs_run_type
  on implementation_runs(run_type);
