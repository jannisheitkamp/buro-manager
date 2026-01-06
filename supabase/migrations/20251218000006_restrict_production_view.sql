
-- Enable RLS on production_entries if not already enabled
alter table public.production_entries enable row level security;

-- Drop existing policies to avoid conflicts
drop policy if exists "Users can view own production entries" on public.production_entries;
drop policy if exists "Users can insert own production entries" on public.production_entries;
drop policy if exists "Users can update own production entries" on public.production_entries;
drop policy if exists "Users can delete own production entries" on public.production_entries;
drop policy if exists "Admins can view all production entries" on public.production_entries;

-- 1. View Policy: Users see their own, Admins see all
create policy "Users view own, Admins view all production" on public.production_entries
  for select using (
    auth.uid() = user_id 
    OR 
    exists (
      select 1 from public.profiles
      where id = auth.uid() and roles @> '{"admin"}'::text[]
    )
  );

-- 2. Insert Policy: Users can only insert for themselves
create policy "Users insert own production" on public.production_entries
  for insert with check (auth.uid() = user_id);

-- 3. Update Policy: Users update own, Admins can update all (optional, or stick to own)
create policy "Users update own production" on public.production_entries
  for update using (auth.uid() = user_id OR exists (select 1 from public.profiles where id = auth.uid() and roles @> '{"admin"}'::text[]));

-- 4. Delete Policy: Users delete own, Admins delete all
create policy "Users delete own production" on public.production_entries
  for delete using (auth.uid() = user_id OR exists (select 1 from public.profiles where id = auth.uid() and roles @> '{"admin"}'::text[]));

