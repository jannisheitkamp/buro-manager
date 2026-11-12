-- Urlaubsübertrag, Änderungsprotokoll, pünktliche Wiedervorlagen und Lebenswerte-Stand

-- 1. Urlaubsübertrag ins neue Jahr -------------------------------------------
-- Ein Eintrag pro Person und Jahr: so viele Tage kommen zum Jahresurlaub dazu.
create table if not exists public.vacation_carryover (
  user_id uuid not null references public.profiles(id) on delete cascade,
  year integer not null,
  days numeric not null default 0 check (days >= 0 and days <= 100),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (user_id, year)
);
alter table public.vacation_carryover enable row level security;

drop policy if exists "Carryover readable by owner, admins and supervisors" on public.vacation_carryover;
create policy "Carryover readable by owner, admins and supervisors" on public.vacation_carryover
  for select to authenticated
  using (user_id = auth.uid() or public.can_moderate_absence(user_id));

drop policy if exists "Carryover managed by admins" on public.vacation_carryover;
create policy "Carryover managed by admins" on public.vacation_carryover
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 2. Änderungsprotokoll ------------------------------------------------------
-- Wer hat wann was geändert. Nur Admins lesen, geschrieben wird ausschließlich per Trigger.
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  actor uuid,
  table_name text not null,
  row_id text,
  action text not null,
  changes jsonb
);
create index if not exists audit_log_created_at_idx on public.audit_log (created_at desc);
alter table public.audit_log enable row level security;

drop policy if exists "Audit log readable by admins" on public.audit_log;
create policy "Audit log readable by admins" on public.audit_log
  for select to authenticated
  using (public.is_admin());

create or replace function public.trg_audit()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  diff jsonb := '{}'::jsonb;
  k text;
  old_j jsonb;
  new_j jsonb;
  watched text[] := tg_argv::text[];
begin
  old_j := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  new_j := case when tg_op <> 'DELETE' then to_jsonb(new) end;

  foreach k in array watched loop
    if tg_op = 'UPDATE' then
      if old_j -> k is distinct from new_j -> k then
        diff := diff || jsonb_build_object(k, jsonb_build_object('alt', old_j -> k, 'neu', new_j -> k));
      end if;
    else
      diff := diff || jsonb_build_object(k, coalesce(new_j, old_j) -> k);
    end if;
  end loop;

  if tg_op = 'UPDATE' and diff = '{}'::jsonb then
    return new;
  end if;

  insert into public.audit_log (actor, table_name, row_id, action, changes)
  values (auth.uid(), tg_table_name, coalesce(new_j, old_j) ->> (case when tg_table_name in ('vacation_carryover', 'production_lv_snapshots') then 'user_id' else 'id' end),
          lower(tg_op), diff);
  return coalesce(new, old);
end $$;
revoke execute on function public.trg_audit() from public, anon, authenticated;

drop trigger if exists audit_absences on public.absences;
create trigger audit_absences
  after insert or update or delete on public.absences
  for each row execute function public.trg_audit('user_id', 'type', 'status', 'start_date', 'end_date', 'used_days', 'deduct_vacation_days');

drop trigger if exists audit_profiles on public.profiles;
create trigger audit_profiles
  after update or delete on public.profiles
  for each row execute function public.trg_audit('full_name', 'roles', 'is_approved', 'total_vacation_days');

drop trigger if exists audit_vacation_carryover on public.vacation_carryover;
create trigger audit_vacation_carryover
  after insert or update or delete on public.vacation_carryover
  for each row execute function public.trg_audit('user_id', 'year', 'days');

-- 3. Wiedervorlagen pünktlich per Push ---------------------------------------
-- Statt einer Sammelmeldung um 7 Uhr: jede Wiedervorlage zur eingetragenen Uhrzeit
-- (ohne Uhrzeit um 8 Uhr), dazu fällige Leads aus "Später anrufen". Jede nur einmal.
alter table public.call_logs add column if not exists follow_up_notified_at timestamptz;
alter table public.leads add column if not exists next_call_notified_at timestamptz;

-- Wird der Termin verschoben, gibt es wieder eine Erinnerung
create or replace function public.reset_followup_notified()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if tg_table_name = 'call_logs' then
    if new.follow_up_date is distinct from old.follow_up_date or new.follow_up_time is distinct from old.follow_up_time then
      new.follow_up_notified_at := null;
    end if;
  elsif new.next_call_at is distinct from old.next_call_at then
    new.next_call_notified_at := null;
  end if;
  return new;
end $$;

drop trigger if exists reset_followup_notified on public.call_logs;
create trigger reset_followup_notified before update on public.call_logs
  for each row execute function public.reset_followup_notified();
drop trigger if exists reset_followup_notified on public.leads;
create trigger reset_followup_notified before update on public.leads
  for each row execute function public.reset_followup_notified();

-- Bestehende, schon überfällige Einträge nicht auf einen Schlag nachmelden
update public.call_logs set follow_up_notified_at = now()
  where status = 'wiedervorlage' and follow_up_date <= (now() at time zone 'Europe/Berlin')::date;
update public.leads set next_call_notified_at = now()
  where next_call_at <= now();

create or replace function public.notify_due_followups()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r record;
begin
  -- Wiedervorlagen aus dem Anrufprotokoll, einzeln
  for r in
    update public.call_logs c
    set follow_up_notified_at = now()
    where c.status = 'wiedervorlage'
      and c.follow_up_notified_at is null
      and c.follow_up_date is not null
      and (c.follow_up_date + coalesce(c.follow_up_time, time '08:00')) <= (now() at time zone 'Europe/Berlin')
    returning c.user_id, c.customer_name, c.follow_up_time
  loop
    perform public.notify(r.user_id, 'followup',
      'Wiedervorlage: ' || coalesce(r.customer_name, 'Kunde'),
      case when r.follow_up_time is not null then 'Fällig um ' || to_char(r.follow_up_time, 'HH24:MI') || ' Uhr' end,
      '/calls?tab=history');
  end loop;

  -- Leads, die wieder angerufen werden sollen: eine Meldung pro Person
  for r in
    with due as (
      update public.leads l
      set next_call_notified_at = now()
      where l.status = 'retry'
        and l.next_call_notified_at is null
        and l.next_call_at <= now()
      returning l.user_id, l.customer_name
    )
    select user_id, count(*) as n, min(customer_name) as first_customer from due group by user_id
  loop
    perform public.notify(r.user_id, 'followup',
      case when r.n = 1 then 'Lead wieder anrufen: ' || coalesce(r.first_customer, 'Kunde') else r.n || ' Leads wieder anrufen' end,
      null, '/calls');
  end loop;
end $$;
revoke execute on function public.notify_due_followups() from public, anon, authenticated;

-- Alle 15 Minuten von 6 bis 20 Uhr (UTC, also etwa 7/8 bis 21/22 Uhr in Deutschland), Montag bis Samstag
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'buero-followups';
  perform cron.schedule('buero-followups', '*/15 6-20 * * 1-6', 'select public.notify_due_followups()');
end $$;

-- 4. Lebenswerte-Stand laut Monatsliste --------------------------------------
-- Am Monatsende kommt die offizielle Liste. Eingetragen wird der Jahresstand bis Ende des Monats
-- (z. B. Ende Oktober 150.000). Die App rechnet ab dann mit diesem Stand statt mit ihrer eigenen Summe.
create table if not exists public.production_lv_snapshots (
  user_id uuid not null references public.profiles(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  ytd_lv numeric not null check (ytd_lv >= 0),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (user_id, month)
);
alter table public.production_lv_snapshots enable row level security;

-- Lesen wie die Produktion selbst (Rangliste für alle), schreiben nur für sich selbst oder als Admin
drop policy if exists "LV snapshots readable" on public.production_lv_snapshots;
create policy "LV snapshots readable" on public.production_lv_snapshots
  for select to authenticated using (true);
drop policy if exists "LV snapshots own or admin" on public.production_lv_snapshots;
create policy "LV snapshots own or admin" on public.production_lv_snapshots
  for all to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

drop trigger if exists audit_production_lv_snapshots on public.production_lv_snapshots;
create trigger audit_production_lv_snapshots
  after insert or update or delete on public.production_lv_snapshots
  for each row execute function public.trg_audit('user_id', 'month', 'ytd_lv');
