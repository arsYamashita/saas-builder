-- Add review status columns to blueprints table
alter table blueprints
  add column if not exists review_status text not null default 'pending',
  add column if not exists reviewed_at timestamptz;
