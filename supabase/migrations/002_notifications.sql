create table if not exists notifications (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  message text not null,
  metadata jsonb,
  is_read boolean default false,
  created_at timestamptz default now()
);

alter table notifications enable row level security;

create policy "users can read own notifications"
  on notifications for select
  using (auth.uid() = user_id);

create policy "service role can insert notifications"
  on notifications for insert
  with check (true);

create index notifications_user_id_unread_idx
  on notifications(user_id, created_at desc)
  where is_read = false;
