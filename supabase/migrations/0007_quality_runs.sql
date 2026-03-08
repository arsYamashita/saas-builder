-- Quality Gate runs: lint / typecheck / playwright 結果を保存
create table if not exists quality_runs (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,
  generation_run_id uuid references generation_runs(id) on delete set null,
  status        text not null default 'running'
                check (status in ('running','passed','failed','error')),
  checks_json   jsonb not null default '[]',
  summary       text,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz
);

create index idx_quality_runs_project on quality_runs(project_id);
create index idx_quality_runs_generation on quality_runs(generation_run_id);
