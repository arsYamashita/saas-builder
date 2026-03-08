create table if not exists generated_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  blueprint_id uuid references blueprints(id) on delete set null,
  source_run_id uuid references implementation_runs(id) on delete set null,

  file_category text not null,
  file_path text not null,
  language text not null,
  status text not null default 'generated',

  title text,
  description text,

  content_text text not null,
  content_json jsonb,

  version int not null default 1,
  source text not null default 'claude',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_generated_files_project_id
  on generated_files(project_id);

create index if not exists idx_generated_files_blueprint_id
  on generated_files(blueprint_id);

create index if not exists idx_generated_files_source_run_id
  on generated_files(source_run_id);

create index if not exists idx_generated_files_file_category
  on generated_files(file_category);

create unique index if not exists idx_generated_files_project_path_version
  on generated_files(project_id, file_path, version);
