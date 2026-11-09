-- Sicherheits-Härtung (Teil 2)
-- ERST EINSPIELEN, WENN VERSION 2.0 LIVE IST.
-- Die alte App fragt Profile mit select('*') ab und würde danach Fehler bekommen.
--
-- 1. webhook_secret und todoist_api_key sind nur noch für die eigene Person lesbar.
-- 2. Krankmeldungen, Unterschriften und Team-Dokumente sind nicht mehr öffentlich abrufbar.

-- ---------------------------------------------------------------------------
-- 1. Geheimnisse in profiles schützen
-- ---------------------------------------------------------------------------
revoke select on public.profiles from authenticated;
grant select (
  id, email, full_name, avatar_url, created_at, roles, address, is_approved,
  agency_number, phone_extension, monthly_goal, yearly_goal, total_vacation_days,
  is_vocational_student, vocational_school_days
) on public.profiles to authenticated;

create or replace function public.get_my_webhook_secret()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select webhook_secret from public.profiles where id = auth.uid();
$$;

revoke execute on function public.get_my_webhook_secret() from anon, public;
grant execute on function public.get_my_webhook_secret() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Dateien nur noch über kurz gültige Links
-- ---------------------------------------------------------------------------
update storage.buckets set public = false where id in ('absence_documents', 'documents');

-- Krankmeldungen und Unterschriften: eigene Dateien, Admins und Vorgesetzte
drop policy if exists "Authenticated users can view absence documents" on storage.objects;
drop policy if exists "Absence documents: owner, admins and supervisors" on storage.objects;
create policy "Absence documents: owner, admins and supervisors"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'absence_documents'
    and (
      split_part(storage.filename(name), '_', 1) = auth.uid()::text
      or public.is_admin()
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.roles && array['tim', 'morris', 'vaupel']
      )
    )
  );

drop policy if exists "Users can delete their absence documents" on storage.objects;
drop policy if exists "Absence documents: owner or admin can delete" on storage.objects;
create policy "Absence documents: owner or admin can delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'absence_documents'
    and (split_part(storage.filename(name), '_', 1) = auth.uid()::text or public.is_admin())
  );
