
-- FORCE RLS on production_entries
alter table public.production_entries enable row level security;

-- Drop ALL existing policies to be absolutely sure
drop policy if exists "Users can view own production entries" on public.production_entries;
drop policy if exists "Users can insert own production entries" on public.production_entries;
drop policy if exists "Users can update own production entries" on public.production_entries;
drop policy if exists "Users can delete own production entries" on public.production_entries;
drop policy if exists "Admins can view all production entries" on public.production_entries;
drop policy if exists "Users view own, Admins view all production" on public.production_entries;
drop policy if exists "Users view own production only" on public.production_entries;
drop policy if exists "Users update own production only" on public.production_entries;
drop policy if exists "Users delete own production only" on public.production_entries;
drop policy if exists "Users insert own production" on public.production_entries;

-- Re-create STRICT policies
create policy "Strict View Own" on public.production_entries
  for select using (auth.uid() = user_id);

create policy "Strict Insert Own" on public.production_entries
  for insert with check (auth.uid() = user_id);

create policy "Strict Update Own" on public.production_entries
  for update using (auth.uid() = user_id);

create policy "Strict Delete Own" on public.production_entries
  for delete using (auth.uid() = user_id);

