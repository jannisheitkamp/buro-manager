create table if not exists public.calendar_events (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  title text not null,
  description text,
  start_time timestamp with time zone not null,
  end_time timestamp with time zone not null,
  user_id uuid references auth.users not null,
  location text,
  color text default 'blue'
);

-- RLS policies
alter table public.calendar_events enable row level security;

create policy "Events are viewable by everyone" on public.calendar_events
  for select using (true);

create policy "Users can insert their own events" on public.calendar_events
  for insert with check (auth.uid() = user_id);

create policy "Users can update their own events" on public.calendar_events
  for update using (auth.uid() = user_id);

create policy "Users can delete their own events" on public.calendar_events
  for delete using (auth.uid() = user_id);
