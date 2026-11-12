-- Datenschutz und Speicher absichern
--
-- 1. Krankmeldungen sehen nur die Person selbst, Admins und die zuständigen Vorgesetzten.
--    Alle anderen sehen über team_absences() nur "Sonstiges", ohne Notiz und ohne eAU.
-- 2. Hochladen in den Speicher nur noch in den eigenen Bereich (eigene User-ID im Pfad).
-- 3. Geteilte Dokumente: Dateien sind nur lesbar, wenn man das Dokument auch sehen darf.
-- 4. Urlaubsanspruch und manuell gesetzte Urlaubstage ändern nur Admins und Vorgesetzte.

-- Darf die angemeldete Person Abwesenheiten von p_user genehmigen? (gleiche Regel wie in der App)
create or replace function public.can_moderate_absence(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.is_admin() or exists (
    select 1
    from public.profiles me, public.profiles target
    where me.id = auth.uid() and target.id = p_user and me.id <> target.id and (
      ('tim' = any(me.roles) and 'jannis' = any(target.roles))
      or ('morris' = any(me.roles) and 'flori' = any(target.roles))
      or ('vaupel' = any(me.roles) and ('marcio' = any(target.roles) or 'lucas' = any(target.roles)))
    )
  );
$$;
revoke execute on function public.can_moderate_absence(uuid) from public, anon;
grant execute on function public.can_moderate_absence(uuid) to authenticated;

-- 1. Krankmeldungen ---------------------------------------------------------

drop policy if exists "Absences are viewable by authenticated users" on public.absences;
create policy "Absences are viewable by authenticated users" on public.absences
  for select to authenticated
  using (type <> 'sick_leave' or user_id = auth.uid() or public.can_moderate_absence(user_id));

-- Liste für alle: wer fehlt wann. Fremde Krankmeldungen erscheinen als "other" ohne Details.
-- Aufruf aus der App: supabase.rpc('team_absences').select('*, profiles(...)')
create or replace function public.team_absences()
returns setof public.absences
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  r public.absences;
begin
  if auth.uid() is null then
    return;
  end if;
  for r in select * from public.absences loop
    if r.type = 'sick_leave' and r.user_id <> auth.uid() and not public.can_moderate_absence(r.user_id) then
      r.type := 'other';
      r.note := null;
      r.certificate_url := null;
    end if;
    return next r;
  end loop;
end $$;
revoke execute on function public.team_absences() from public, anon;
grant execute on function public.team_absences() to authenticated;

-- 4. Urlaubstage ------------------------------------------------------------

create or replace function public.protect_absence_fields()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- auth.uid() ist leer bei Service-Role
  if auth.uid() is not null and not public.can_moderate_absence(new.user_id) then
    if tg_op = 'INSERT' then
      new.used_days := null;
    else
      -- Ob und wie viele Tage abgezogen werden, entscheidet nach dem Antrag nur die genehmigende Person
      new.used_days := old.used_days;
      new.deduct_vacation_days := old.deduct_vacation_days;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists protect_absence_fields on public.absences;
create trigger protect_absence_fields
  before insert or update on public.absences
  for each row execute function public.protect_absence_fields();

create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- auth.uid() ist leer bei Service-Role und beim Signup-Trigger
  if auth.uid() is not null and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.roles := '{employee}';
      new.is_approved := false;
      new.total_vacation_days := 30;
    else
      new.roles := old.roles;
      new.is_approved := old.is_approved;
      new.total_vacation_days := old.total_vacation_days;
    end if;
  end if;
  return new;
end;
$$;

-- 2. Speicher: nur in den eigenen Bereich hochladen --------------------------

-- Krankmeldungen und Unterschriften: Dateiname beginnt mit der eigenen User-ID
drop policy if exists "Authenticated users can upload absence documents" on storage.objects;
create policy "Authenticated users can upload absence documents" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'absence_documents' and split_part(storage.filename(name), '_', 1) = auth.uid()::text);

-- Produktionsunterlagen: Ordner = eigene User-ID
drop policy if exists "Allow authenticated to upload production docs" on storage.objects;
create policy "Allow authenticated to upload production docs" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'production_docs' and (storage.foldername(name))[1] = auth.uid()::text);

-- Profilbilder: nur im eigenen Ordner anlegen, ändern und löschen
drop policy if exists "Avatar Upload" on storage.objects;
create policy "Avatar Upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Avatar Update" on storage.objects;
create policy "Avatar Update" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Avatar Delete" on storage.objects;
create policy "Avatar Delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- 3. Dokumente: Ordner = eigene User-ID; Admins pflegen den Ordner "office" (z. B. Empfangsplan)
drop policy if exists "Authenticated users can upload documents" on storage.objects;
create policy "Authenticated users can upload documents" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and ((storage.foldername(name))[1] = auth.uid()::text or ((storage.foldername(name))[1] = 'office' and public.is_admin()))
  );

-- Lesen: Büro-Ordner für alle, sonst nur, wenn das zugehörige Dokument sichtbar ist
-- (die Unterabfrage auf documents läuft mit den Rechten der Person, also mit deren RLS)
drop policy if exists "Users can view their own or shared documents" on storage.objects;
create policy "Users can view their own or shared documents" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and (
      (storage.foldername(name))[1] in ('office', auth.uid()::text)
      or exists (select 1 from public.documents d where d.file_path = storage.objects.name)
    )
  );

-- Löschen fehlte ganz (Dateien blieben nach dem Löschen eines Dokuments liegen)
drop policy if exists "Users can delete own documents" on storage.objects;
create policy "Users can delete own documents" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documents'
    and ((storage.foldername(name))[1] = auth.uid()::text or ((storage.foldername(name))[1] = 'office' and public.is_admin()))
  );

-- Dateipfad eines Dokuments muss im eigenen Ordner liegen (bzw. "office" für Admins).
-- Sonst könnte jemand ein Dokument mit dem Pfad einer fremden Datei anlegen und diese so lesen.
create or replace function public.check_document_file_path()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null or new.file_path is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.file_path is not distinct from old.file_path then
    return new;
  end if;
  if split_part(new.file_path, '/', 1) = auth.uid()::text
     or (split_part(new.file_path, '/', 1) = 'office' and public.is_admin()) then
    return new;
  end if;
  raise exception 'Ungültiger Dateipfad';
end $$;

drop trigger if exists check_document_file_path on public.documents;
create trigger check_document_file_path
  before insert or update of file_path on public.documents
  for each row execute function public.check_document_file_path();
