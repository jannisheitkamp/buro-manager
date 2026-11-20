-- Admins tragen Abwesenheiten für andere ein (Planung, ohne Antrag) und dürfen sie wieder löschen
create policy "Admins can insert absences" on public.absences
  for insert to authenticated with check (public.is_admin());

create policy "Admins can delete absences" on public.absences
  for delete to authenticated using (public.is_admin());

-- Keine Benachrichtigungen, wenn ein Admin für jemand anderen einträgt
create or replace function public.trg_notify_absence()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
        'admin' = any(p.roles)
        or ('tim' = any(p.roles) and 'jannis' = any(requester.roles))
        or ('morris' = any(p.roles) and 'flori' = any(requester.roles))
        or ('vaupel' = any(p.roles) and ('marcio' = any(requester.roles) or 'lucas' = any(requester.roles)))
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
    -- Krankmeldungen sind sofort gültig: Admins informieren
    for approver in select p.id from public.profiles p where 'admin' = any(p.roles) and p.id <> new.user_id loop
      perform public.notify(approver, 'absence_info', public.first_name(new.user_id) || ' ist krank gemeldet',
        to_char(new.start_date, 'DD.MM.') || ' bis ' || to_char(new.end_date, 'DD.MM.YYYY'), '/calendar');
    end loop;
  end if;
  return new;
end $function$;
