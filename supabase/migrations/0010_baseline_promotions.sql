-- Baseline promotion history
create table if not exists baseline_promotions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  generation_run_id uuid not null references generation_runs(id) on delete cascade,
  template_key text not null,
  baseline_tag text not null,
  version_label text not null,
  status text not null default 'draft',
  promoted_at timestamptz not null default now(),
  promoted_by uuid
);

create index if not exists idx_baseline_promotions_project on baseline_promotions(project_id);
create index if not exists idx_baseline_promotions_template on baseline_promotions(template_key);
