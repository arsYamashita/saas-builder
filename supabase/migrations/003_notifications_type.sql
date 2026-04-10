-- Add notification type column for filtering (billing / project / system)
alter table notifications
  add column if not exists type text not null default 'system'
    check (type in ('billing', 'project', 'system'));

-- Update index to include type for efficient filter queries
create index if not exists notifications_user_id_type_idx
  on notifications(user_id, type, created_at desc);

-- Allow users to update (mark read) their own notifications
create policy if not exists "users can update own notifications"
  on notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
