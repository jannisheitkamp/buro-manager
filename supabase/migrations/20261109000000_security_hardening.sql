-- Sicherheits-Härtung (Teil 1)
-- Kompatibel mit der bisherigen App-Version, kann sofort eingespielt werden.
--
-- 1. Ohne Login (Rolle "anon") gibt es keinerlei Zugriff mehr auf Tabellen und Funktionen.
-- 2. Nutzer können sich nicht mehr selbst Rollen geben oder freischalten.
-- 3. Offene "für alle"-Policies werden auf angemeldete Nutzer beschränkt.
-- 4. Avatare können nur noch von angemeldeten Nutzern hochgeladen werden.

-- ---------------------------------------------------------------------------
-- 1. Kein Zugriff ohne Login
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon;

-- Interne Funktionen dürfen auch angemeldete Nutzer nicht direkt aufrufen
revoke execute on function public.award_badge(uuid, text, text, text, text) from authenticated, public;
revoke execute on function public.handle_new_user() from authenticated, public;

-- search_path festlegen (Supabase-Linter-Warnung)
alter function public.award_badge(uuid, text, text, text, text) set search_path = public;
alter function public.is_document_creator(uuid, uuid) set search_path = public;
alter function public.check_is_document_creator(uuid) set search_path = public;
alter function public.check_is_document_shared(uuid) set search_path = public;
alter function public.check_booking_overlap() set search_path = public;

-- ---------------------------------------------------------------------------
-- 2. Rollen und Freischaltung nur durch Admins
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and 'admin' = any(roles)
  );
$$;

revoke execute on function public.is_admin() from anon, public;
grant execute on function public.is_admin() to authenticated;

create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- auth.uid() ist leer bei Service-Role und beim Signup-Trigger
  if auth.uid() is not null and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.roles := '{employee}';
      new.is_approved := false;
    else
      new.roles := old.roles;
      new.is_approved := old.is_approved;
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.protect_profile_privileges() from anon, authenticated, public;

drop trigger if exists protect_profile_privileges on public.profiles;
create trigger protect_profile_privileges
  before insert or update on public.profiles
  for each row execute function public.protect_profile_privileges();

-- ---------------------------------------------------------------------------
-- 3. Offene Policies auf angemeldete Nutzer beschränken
-- ---------------------------------------------------------------------------
drop policy if exists "Public profiles" on public.profiles;

drop policy if exists "View production" on public.production_entries;
drop policy if exists "Production entries are viewable by everyone" on public.production_entries;

drop policy if exists "Events are viewable by everyone" on public.calendar_events;
drop policy if exists "Public status" on public.user_status;
drop policy if exists "View polls" on public.polls;

drop policy if exists "Users can view all call logs" on public.call_logs;
drop policy if exists "Call logs viewable by authenticated users" on public.call_logs;
create policy "Call logs viewable by authenticated users"
  on public.call_logs for select to authenticated using (true);

-- Rückrufe und Pakete bleiben Team-Sache, aber nur für angemeldete Nutzer
drop policy if exists "Team callbacks" on public.callbacks;
create policy "Team callbacks"
  on public.callbacks for all to authenticated using (true) with check (true);

drop policy if exists "Team parcels" on public.parcels;
create policy "Team parcels"
  on public.parcels for all to authenticated using (true) with check (true);

-- Stimmen: jeder nur seine eigene (lesen dürfen alle Angemeldeten)
drop policy if exists "Vote polls" on public.poll_votes;

-- Abzeichen werden nur per Trigger vergeben
drop policy if exists "Users can manage badges" on public.user_badges;
drop policy if exists "Everyone can read user_badges" on public.user_badges;
drop policy if exists "Badges viewable by authenticated users" on public.user_badges;
create policy "Badges viewable by authenticated users"
  on public.user_badges for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- 4. Avatare nur für angemeldete Nutzer
-- ---------------------------------------------------------------------------
drop policy if exists "Anyone can upload an avatar" on storage.objects;
drop policy if exists "Anyone can update their own avatar" on storage.objects;
