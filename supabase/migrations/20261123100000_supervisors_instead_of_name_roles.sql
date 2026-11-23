-- Vorgesetzte statt fest eingetragener Namen
-- Bisher hingen Genehmigungen an Namensrollen ('tim' prüft 'jannis' usw.), fest im Code.
-- Jetzt hat jedes Profil eine Liste von Vorgesetzten (supervisor_ids), die Admins im Verzeichnis pflegen.
-- Bewusst ohne Fremdschlüssel: ein zweiter Bezug auf profiles bricht sonst profiles(...)-Embeds.

alter table public.profiles add column if not exists supervisor_ids uuid[] not null default '{}';
grant select (supervisor_ids) on public.profiles to authenticated;

-- Bestehende Zuordnungen übernehmen
update public.profiles target set supervisor_ids = coalesce((
  select array_agg(me.id) from public.profiles me
  where me.id <> target.id and (
    ('tim' = any(me.roles) and 'jannis' = any(target.roles))
    or ('morris' = any(me.roles) and 'flori' = any(target.roles))
    or ('vaupel' = any(me.roles) and ('marcio' = any(target.roles) or 'lucas' = any(target.roles)))
  )
), '{}');

-- Namensrollen entfernen; Gruppen bleiben frei benennbar (gruppe_...)
update public.profiles set roles = array(
  select r from unnest(roles) r where r not in ('tim', 'morris', 'vaupel', 'jannis', 'flori', 'marcio', 'lucas')
);

create or replace function public.valid_roles(p_roles text[])
returns boolean language sql immutable as $$
  select coalesce(bool_and(r ~ '^(admin|employee|selbststaendig|gruppe_[a-z0-9_]+)$'), true) from unnest(p_roles) r;
$$;

alter table public.profiles drop constraint if exists profiles_roles_check;
alter table public.profiles add constraint profiles_roles_check check (public.valid_roles(roles));

-- Nur Admins dürfen Vorgesetzte ändern
create or replace function public.protect_profile_privileges()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  -- auth.uid() ist leer bei Service-Role und beim Signup-Trigger
  if auth.uid() is not null and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.roles := '{employee}';
      new.is_approved := false;
      new.total_vacation_days := 30;
      new.supervisor_ids := '{}';
    else
      new.roles := old.roles;
      new.is_approved := old.is_approved;
      new.total_vacation_days := old.total_vacation_days;
      new.supervisor_ids := old.supervisor_ids;
    end if;
  end if;
  return new;
end;
$function$;

-- Ist die angemeldete Person Vorgesetzte(r) von p_user?
create or replace function public.is_supervisor_of(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles t where t.id = p_user and t.id <> auth.uid() and auth.uid() = any(t.supervisor_ids));
$$;
revoke execute on function public.is_supervisor_of(uuid) from anon, public;
grant execute on function public.is_supervisor_of(uuid) to authenticated;

create or replace function public.can_moderate_absence(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or public.is_supervisor_of(p_user);
$$;

drop policy if exists "Supervisors can update supervisee absences" on public.absences;
create policy "Supervisors can update supervisee absences"
  on public.absences for update to authenticated
  using (public.is_supervisor_of(absences.user_id));

-- Krankmeldungen: nur noch die eigenen Vorgesetzten, nicht mehr jede Person mit Vorgesetzten-Rolle
drop policy if exists "Absence documents: owner, admins and supervisors" on storage.objects;
create policy "Absence documents: owner, admins and supervisors"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'absence_documents'
    and (
      split_part(storage.filename(name), '_', 1) = auth.uid()::text
      or public.is_admin()
      or (
        split_part(storage.filename(name), '_', 1) ~ '^[0-9a-f-]{36}$'
        and public.is_supervisor_of(split_part(storage.filename(name), '_', 1)::uuid)
      )
    )
  );

create or replace function public.trg_notify_absence()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  requester public.profiles;
  label text;
  approver uuid;
begin
  select * into requester from public.profiles where id = new.user_id;
  label := case new.type when 'vacation' then 'Urlaub' when 'sick_leave' then 'Krankmeldung' when 'seminar' then 'Seminar'
                         when 'school' then 'Berufsschule' else 'Abwesenheit' end;

  if tg_op = 'INSERT' and auth.uid() is not null and auth.uid() <> new.user_id then
    -- Von einem Admin für die Planung eingetragen: keine Benachrichtigung
    null;
  elsif tg_op = 'INSERT' and new.status = 'pending' then
    for approver in
      select p.id from public.profiles p
      where p.id <> new.user_id and p.is_approved is not false and (
        'admin' = any(p.roles) or p.id = any(requester.supervisor_ids)
      )
    loop
      perform public.notify(approver, 'absence_request', label || '-Antrag von ' || public.first_name(new.user_id),
        to_char(new.start_date, 'DD.MM.') || ' bis ' || to_char(new.end_date, 'DD.MM.YYYY'), '/calendar');
    end loop;
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status in ('approved', 'rejected') then
    perform public.notify(new.user_id, 'absence_decision',
      label || case when new.status = 'approved' then ' genehmigt' else ' abgelehnt' end,
      to_char(new.start_date, 'DD.MM.') || ' bis ' || to_char(new.end_date, 'DD.MM.YYYY'), '/calendar');
  elsif tg_op = 'INSERT' and new.type = 'sick_leave' then
    for approver in select p.id from public.profiles p where 'admin' = any(p.roles) and p.id <> new.user_id loop
      perform public.notify(approver, 'absence_info', public.first_name(new.user_id) || ' ist krank gemeldet',
        to_char(new.start_date, 'DD.MM.') || ' bis ' || to_char(new.end_date, 'DD.MM.YYYY'), '/calendar');
    end loop;
  end if;
  return new;
end
$function$;
