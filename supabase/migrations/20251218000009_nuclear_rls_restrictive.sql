
-- NUCLEAR RLS FIX: Use RESTRICTIVE policy to override any permissive leaks
alter table public.production_entries enable row level security;

-- Create a RESTRICTIVE policy. This acts as a logical AND with any other policy.
-- So even if there is a policy saying 'allow all', this one says 'BUT only if user_id = auth.uid()'.
create policy "Global Privacy Shield" on public.production_entries
  as restrictive
  for all
  using (auth.uid() = user_id);

-- Ensure we have at least one PERMISSIVE policy to allow access at all (otherwise restrictive blocks everything)
-- We already have 'Strict View Own', but let's make sure.
drop policy if exists "Basic Owner Access" on public.production_entries;
create policy "Basic Owner Access" on public.production_entries
  for all
  using (auth.uid() = user_id);

