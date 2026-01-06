
-- STRICT Privacy: Everyone (including Admins) only sees their own production entries.
-- This overrides previous admin-access policies.

drop policy if exists "Users view own, Admins view all production" on public.production_entries;
drop policy if exists "Users update own production" on public.production_entries;
drop policy if exists "Users delete own production" on public.production_entries;

-- 1. View Policy: STRICTLY own entries only
create policy "Users view own production only" on public.production_entries
  for select using (auth.uid() = user_id);

-- 2. Update Policy: STRICTLY own entries only
create policy "Users update own production only" on public.production_entries
  for update using (auth.uid() = user_id);

-- 3. Delete Policy: STRICTLY own entries only
create policy "Users delete own production only" on public.production_entries
  for delete using (auth.uid() = user_id);

-- Insert policy remains the same (auth.uid() = user_id)

