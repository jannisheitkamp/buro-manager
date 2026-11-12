-- Urlaubsanträge: Unterschrift der genehmigenden Person
--
-- 1. Neue Spalten: wer hat wann entschieden, und die Unterschrift bei der Genehmigung.
-- 2. approved_by / approved_at setzt die Datenbank selbst; Mitarbeiter können die Felder nicht fälschen.
-- 3. Die antragstellende Person darf die Unterschrift lesen, die auf ihrem eigenen Antrag steht (für das PDF).
-- 4. Halber Urlaubstag (nur bei eintägigen Anträgen).
-- Wiederholbar.

alter table public.absences
  add column if not exists approved_by uuid, -- bewusst ohne Fremdschlüssel: ein zweiter Verweis auf profiles macht profiles(...) in der API mehrdeutig (HTTP 300)
  add column if not exists approved_at timestamptz,
  add column if not exists approver_signature_url text,
  add column if not exists half_day boolean not null default false;

alter table public.absences drop constraint if exists absences_approved_by_fkey;
alter table public.absences drop constraint if exists absences_half_day_single_day;
alter table public.absences add constraint absences_half_day_single_day
  check (not half_day or start_date = end_date);

create or replace function public.protect_absence_fields()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- auth.uid() ist leer bei Service-Role
  if auth.uid() is null then
    return new;
  end if;

  if not public.can_moderate_absence(new.user_id) then
    -- Ob und wie viele Tage abgezogen werden, entscheidet nach dem Antrag nur die genehmigende Person
    if tg_op = 'INSERT' then
      new.used_days := null;
    else
      new.used_days := old.used_days;
      new.deduct_vacation_days := old.deduct_vacation_days;
      new.half_day := old.half_day;
    end if;
  end if;

  -- Wer wann entschieden hat und die Freigabe-Unterschrift setzt nur die Datenbank, für alle Rollen
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    new.approved_by := old.approved_by;
    new.approved_at := old.approved_at;
    new.approver_signature_url := old.approver_signature_url;
  elsif new.status = 'approved' and public.can_moderate_absence(new.user_id) then
    new.approved_by := auth.uid();
    new.approved_at := now();
    -- Nur die eigene Freigabe-Unterschrift, keine beliebigen Dateien (sonst ließe sich z. B. eine fremde eAU freigeben)
    if new.approver_signature_url is not null
      and new.approver_signature_url not like 'signatures/' || auth.uid()::text || '\_approval\_%' then
      raise exception 'Ungültige Unterschrift';
    end if;
  elsif new.status = 'rejected' and public.can_moderate_absence(new.user_id) then
    new.approved_by := auth.uid();
    new.approved_at := now();
    new.approver_signature_url := null;
  else
    -- Offen oder automatisch genehmigt (Krankmeldung, Seminar, Schule): keine Entscheidung
    new.approved_by := null;
    new.approved_at := null;
    new.approver_signature_url := null;
  end if;

  return new;
end $$;

drop trigger if exists protect_absence_fields on public.absences;
create trigger protect_absence_fields
  before insert or update on public.absences
  for each row execute function public.protect_absence_fields();

-- Speicher: zusätzlich die Freigabe-Unterschrift auf dem eigenen Antrag lesbar
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
      or exists (
        select 1 from public.absences a
        where a.user_id = auth.uid()
          and a.approver_signature_url = storage.objects.name
          and storage.objects.name like 'signatures/%\_approval\_%'
          and split_part(storage.filename(storage.objects.name), '_', 1) = a.approved_by::text
      )
    )
  );
