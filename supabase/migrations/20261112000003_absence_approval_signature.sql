-- Urlaubsanträge: Unterschrift der genehmigenden Person
--
-- 1. Neue Spalten: wer hat wann entschieden, und die Unterschrift bei der Genehmigung.
-- 2. approved_by / approved_at setzt die Datenbank selbst; Mitarbeiter können die Felder nicht fälschen.
-- 3. Die antragstellende Person darf die Unterschrift lesen, die auf ihrem eigenen Antrag steht (für das PDF).
-- 4. Halber Urlaubstag (nur bei eintägigen Anträgen).
-- Wiederholbar.

alter table public.absences
  add column if not exists approved_by uuid references public.profiles(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists approver_signature_url text,
  add column if not exists half_day boolean not null default false;

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
  if auth.uid() is not null and not public.can_moderate_absence(new.user_id) then
    if tg_op = 'INSERT' then
      new.used_days := null;
      new.approved_by := null;
      new.approved_at := null;
      new.approver_signature_url := null;
    else
      -- Ob und wie viele Tage abgezogen werden, entscheidet nach dem Antrag nur die genehmigende Person
      new.used_days := old.used_days;
      new.deduct_vacation_days := old.deduct_vacation_days;
      new.approved_by := old.approved_by;
      new.approved_at := old.approved_at;
      new.approver_signature_url := old.approver_signature_url;
    end if;
  elsif auth.uid() is not null
    and new.approver_signature_url is not null
    and (tg_op = 'INSERT' or new.approver_signature_url is distinct from old.approver_signature_url)
    and new.approver_signature_url not like 'signatures/' || auth.uid()::text || '\_approval\_%' then
    -- Nur die eigene Freigabe-Unterschrift, keine beliebigen Dateien (sonst ließe sich z. B. eine fremde eAU freigeben)
    raise exception 'Ungültige Unterschrift';
  end if;

  if auth.uid() is not null and tg_op = 'UPDATE' and new.status is distinct from old.status
    and public.can_moderate_absence(new.user_id) then
    -- Entscheidung protokollieren
    if new.status in ('approved', 'rejected') then
      new.approved_by := auth.uid();
      new.approved_at := now();
    else
      new.approved_by := null;
      new.approved_at := null;
      new.approver_signature_url := null;
    end if;
    if new.status = 'rejected' then
      new.approver_signature_url := null;
    end if;
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
