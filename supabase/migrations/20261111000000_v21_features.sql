-- Büro Manager 2.1
-- Empfangsplan in der Datenbank, Tausch unter Kollegen, Benachrichtigungen (in der App und als Push),
-- Erinnerung an Wiedervorlagen und Kalender-Abo.
-- Kann gefahrlos mehrfach ausgeführt werden. Die App funktioniert auch, solange diese Datei noch fehlt.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- ===========================================================================
-- Hilfsfunktion: Rollen-Kürzel (z. B. 'flori') zu Profil
-- ===========================================================================
create or replace function public.profile_by_tag(p_tag text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.profiles
  where lower(p_tag) = any(roles) and is_approved is not false
  order by created_at
  limit 1;
$$;
revoke execute on function public.profile_by_tag(text) from public, anon;
grant execute on function public.profile_by_tag(text) to authenticated;

-- ===========================================================================
-- 1. Empfangsplan
-- ===========================================================================
-- Fester Wochenplan. Mehrere Personen an einem Tag wechseln sich wöchentlich ab,
-- gezählt ab der Woche von rotation_start.
create table if not exists public.reception_rules (
  weekday smallint primary key check (weekday between 1 and 5),
  persons text[] not null check (array_length(persons, 1) >= 1),
  rotation_start date not null default date '2026-08-31',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

-- Einzelne Tage abweichend vom Plan (Vertretung, Tausch, Sonderfall)
create table if not exists public.reception_overrides (
  day date primary key,
  person text not null,
  user_id uuid references public.profiles(id) on delete set null,
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Tauschanfragen: wer einen Tag hat, bietet ihn einer anderen Person an
create table if not exists public.reception_swaps (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  from_user uuid not null references public.profiles(id) on delete cascade,
  to_user uuid not null references public.profiles(id) on delete cascade,
  note text check (note is null or char_length(note) <= 300),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (from_user <> to_user)
);
create index if not exists reception_swaps_to_user_idx on public.reception_swaps (to_user) where status = 'pending';

-- Startwerte = bisheriger Plan (nur wenn noch leer)
insert into public.reception_rules (weekday, persons) values
  (1, array['Jannis', 'Flori']),
  (2, array['Lucas']),
  (3, array['Flori']),
  (4, array['Jannis']),
  (5, array['Lucas'])
on conflict (weekday) do nothing;

alter table public.reception_rules enable row level security;
alter table public.reception_overrides enable row level security;
alter table public.reception_swaps enable row level security;

drop policy if exists "Reception rules readable" on public.reception_rules;
create policy "Reception rules readable" on public.reception_rules for select to authenticated using (true);
drop policy if exists "Reception rules admin write" on public.reception_rules;
create policy "Reception rules admin write" on public.reception_rules for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Reception overrides readable" on public.reception_overrides;
create policy "Reception overrides readable" on public.reception_overrides for select to authenticated using (true);
drop policy if exists "Reception overrides admin write" on public.reception_overrides;
create policy "Reception overrides admin write" on public.reception_overrides for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Reception swaps readable" on public.reception_swaps;
create policy "Reception swaps readable" on public.reception_swaps for select to authenticated using (true);
drop policy if exists "Reception swaps create own" on public.reception_swaps;
create policy "Reception swaps create own" on public.reception_swaps for insert to authenticated
  with check (from_user = auth.uid() and status = 'pending');
drop policy if exists "Reception swaps cancel own" on public.reception_swaps;
create policy "Reception swaps cancel own" on public.reception_swaps for update to authenticated
  using (from_user = auth.uid() and status = 'pending')
  with check (from_user = auth.uid() and status = 'cancelled');

-- Wer ist an einem Tag eingeteilt? (Abweichung vor Wochenplan, Wechsel wöchentlich ab rotation_start)
create or replace function public.reception_assignee(p_day date)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  o public.reception_overrides;
  r public.reception_rules;
  weeks int;
  person text;
begin
  select * into o from public.reception_overrides where day = p_day;
  if found then
    return coalesce(o.user_id, public.profile_by_tag(o.person));
  end if;
  select * into r from public.reception_rules where weekday = extract(isodow from p_day);
  if not found then
    return null;
  end if;
  weeks := floor((date_trunc('week', p_day)::date - date_trunc('week', r.rotation_start)::date) / 7.0);
  person := r.persons[1 + ((weeks % array_length(r.persons, 1)) + array_length(r.persons, 1)) % array_length(r.persons, 1)];
  return public.profile_by_tag(person);
end;
$$;
revoke execute on function public.reception_assignee(date) from public, anon, authenticated;

-- Tauschanfragen nur für eigene, künftige Tage und an freigeschaltete Personen
create or replace function public.check_reception_swap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.day < (now() at time zone 'Europe/Berlin')::date then
    raise exception 'Vergangene Tage können nicht getauscht werden.';
  end if;
  if public.reception_assignee(new.day) is distinct from new.from_user then
    raise exception 'Du bist an diesem Tag nicht am Empfang eingeteilt.';
  end if;
  if not exists (select 1 from public.profiles where id = new.to_user and is_approved is not false) then
    raise exception 'Diese Person gibt es nicht oder sie ist nicht freigeschaltet.';
  end if;
  if exists (select 1 from public.reception_swaps where day = new.day and status = 'pending') then
    raise exception 'Für diesen Tag läuft schon eine Anfrage.';
  end if;
  return new;
end;
$$;
revoke execute on function public.check_reception_swap() from public, anon, authenticated;
drop trigger if exists check_reception_swap on public.reception_swaps;
create trigger check_reception_swap before insert on public.reception_swaps for each row execute function public.check_reception_swap();

-- Tausch annehmen oder ablehnen (nur die angefragte Person)
create or replace function public.respond_reception_swap(p_swap_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.reception_swaps;
  first_name text;
begin
  select * into s from public.reception_swaps where id = p_swap_id for update;
  if not found or s.to_user <> auth.uid() then
    raise exception 'Diese Anfrage gibt es nicht oder sie ist nicht an dich gerichtet.';
  end if;
  if s.status <> 'pending' then
    raise exception 'Diese Anfrage wurde schon beantwortet.';
  end if;
  -- Nur wenn der Tag noch kommt und die anfragende Person ihn weiterhin hat
  if p_accept and (s.day < (now() at time zone 'Europe/Berlin')::date or public.reception_assignee(s.day) is distinct from s.from_user) then
    raise exception 'Die Anfrage ist nicht mehr gültig, der Tag ist vorbei oder wurde inzwischen anders vergeben.';
  end if;

  update public.reception_swaps
    set status = case when p_accept then 'accepted' else 'declined' end, responded_at = now()
    where id = p_swap_id;

  if p_accept then
    select split_part(coalesce(full_name, email), ' ', 1) into first_name from public.profiles where id = s.to_user;
    insert into public.reception_overrides (day, person, user_id, note, created_by)
      values (s.day, first_name, s.to_user, 'Tausch', s.to_user)
      on conflict (day) do update set person = excluded.person, user_id = excluded.user_id, note = excluded.note,
        created_by = excluded.created_by, created_at = now();
  end if;
end;
$$;
revoke execute on function public.respond_reception_swap(uuid, boolean) from public, anon;
grant execute on function public.respond_reception_swap(uuid, boolean) to authenticated;

-- ===========================================================================
-- 2. Benachrichtigungen
-- ===========================================================================
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'info',
  title text not null,
  body text,
  link text,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  pushed_at timestamptz
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;
drop policy if exists "Notifications own read" on public.notifications;
create policy "Notifications own read" on public.notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists "Notifications own update" on public.notifications;
create policy "Notifications own update" on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "Notifications own delete" on public.notifications;
create policy "Notifications own delete" on public.notifications for delete to authenticated using (user_id = auth.uid());

-- Nur read_at darf vom Nutzer geändert werden
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Live-Aktualisierung in der App
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- Benachrichtigung anlegen (nur intern aus Triggern)
create or replace function public.notify(p_user uuid, p_kind text, p_title text, p_body text, p_link text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications (user_id, kind, title, body, link)
  select p_user, p_kind, p_title, p_body, p_link
  where p_user is not null;
$$;
revoke execute on function public.notify(uuid, text, text, text, text) from public, anon, authenticated;

create or replace function public.first_name(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select split_part(coalesce(full_name, email, 'Jemand'), ' ', 1) from public.profiles where id = p_user;
$$;
revoke execute on function public.first_name(uuid) from public, anon, authenticated;

-- Rückruf zugewiesen
create or replace function public.trg_notify_callback()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.assigned_to is not null and new.assigned_to is distinct from new.created_by then
    perform public.notify(new.assigned_to, 'callback',
      case when new.priority = 'high' then 'Dringender Rückruf: ' else 'Rückruf: ' end || new.customer_name,
      coalesce(new.topic, new.phone), '/calls?tab=tasks');
  end if;
  return new;
end $$;
drop trigger if exists notify_callback on public.callbacks;
create trigger notify_callback after insert on public.callbacks for each row execute function public.trg_notify_callback();

-- Paket angekommen oder angekündigt
create or replace function public.trg_notify_parcel()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.recipient_id is distinct from new.created_by and (tg_op = 'INSERT' or (old.status = 'expected' and new.status = 'pending')) then
    perform public.notify(new.recipient_id, 'parcel',
      case when new.status = 'expected' then 'Paket angekündigt' else 'Paket für dich' end,
      concat_ws(', ', new.carrier, case when new.status = 'pending' then new.location end), '/parcels');
  end if;
  return new;
end $$;
drop trigger if exists notify_parcel on public.parcels;
create trigger notify_parcel after insert or update of status on public.parcels for each row execute function public.trg_notify_parcel();

-- Abwesenheiten: Antrag an Vorgesetzte, Entscheidung an Antragsteller
create or replace function public.trg_notify_absence()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  requester public.profiles;
  label text;
  approver uuid;
begin
  select * into requester from public.profiles where id = new.user_id;
  label := case new.type when 'vacation' then 'Urlaub' when 'sick_leave' then 'Krankmeldung' when 'seminar' then 'Seminar'
                         when 'school' then 'Berufsschule' else 'Abwesenheit' end;

  if tg_op = 'INSERT' and new.status = 'pending' then
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
end $$;
drop trigger if exists notify_absence on public.absences;
create trigger notify_absence after insert or update of status on public.absences for each row execute function public.trg_notify_absence();

-- Empfang: Tauschanfrage und Antwort
create or replace function public.trg_notify_swap()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.notify(new.to_user, 'swap_request',
      public.first_name(new.from_user) || ' fragt: Empfang am ' || to_char(new.day, 'DD.MM.') || ' übernehmen?',
      new.note, '/reception');
  elsif old.status = 'pending' and new.status in ('accepted', 'declined') then
    perform public.notify(new.from_user, 'swap_answer',
      public.first_name(new.to_user) || case when new.status = 'accepted' then ' übernimmt' else ' kann nicht am' end
        || ' ' || to_char(new.day, 'DD.MM.') || case when new.status = 'accepted' then ' den Empfang' else '' end,
      null, '/reception');
  end if;
  return new;
end $$;
drop trigger if exists notify_swap on public.reception_swaps;
create trigger notify_swap after insert or update of status on public.reception_swaps for each row execute function public.trg_notify_swap();

-- Empfang: Vertretung eingetragen
create or replace function public.trg_notify_override()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is not null and new.user_id is distinct from new.created_by
     and (tg_op = 'INSERT' or old.user_id is distinct from new.user_id) then
    perform public.notify(new.user_id, 'reception', 'Du übernimmst den Empfang am ' || to_char(new.day, 'DD.MM.'),
      new.note, '/reception');
  end if;
  return new;
end $$;
drop trigger if exists notify_override on public.reception_overrides;
create trigger notify_override after insert or update on public.reception_overrides for each row execute function public.trg_notify_override();

-- Neue Ankündigung am Schwarzen Brett an alle
create or replace function public.trg_notify_post()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  u uuid;
begin
  if new.type = 'announcement' then
    for u in select id from public.profiles where id <> new.user_id and is_approved is not false loop
      perform public.notify(u, 'post', 'Neue Ankündigung: ' || new.title, public.first_name(new.user_id), '/board');
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists notify_post on public.posts;
create trigger notify_post after insert on public.posts for each row execute function public.trg_notify_post();

-- ===========================================================================
-- 3. Push aufs Handy
-- ===========================================================================
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "Push subscriptions own" on public.push_subscriptions;
create policy "Push subscriptions own" on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Jede neue Benachrichtigung an die Edge Function "send-push" geben.
-- Die Funktion lädt die Benachrichtigung selbst aus der Datenbank, der Aufruf enthält nur die ID.
create or replace function public.trg_send_push()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  perform net.http_post(
    url := 'https://snvdxjpoqfniyhtfqkza.supabase.co/functions/v1/send-push',
    body := jsonb_build_object('id', new.id),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  return new;
exception when others then
  -- Push darf das Anlegen der Benachrichtigung nie verhindern
  return new;
end $$;
drop trigger if exists send_push on public.notifications;
create trigger send_push after insert on public.notifications for each row execute function public.trg_send_push();

-- ===========================================================================
-- 4. Morgendliche Erinnerung an fällige Wiedervorlagen (ca. 7 Uhr)
-- ===========================================================================
create or replace function public.notify_due_followups()
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  for r in
    select user_id, count(*) as n, min(customer_name) as first_customer
    from public.call_logs
    where status = 'wiedervorlage' and follow_up_date <= (now() at time zone 'Europe/Berlin')::date
    group by user_id
  loop
    perform public.notify(r.user_id, 'followup',
      case when r.n = 1 then 'Wiedervorlage heute: ' || r.first_customer else r.n || ' Wiedervorlagen sind fällig' end,
      null, '/calls?tab=history');
  end loop;
end $$;
revoke execute on function public.notify_due_followups() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'buero-followups';
  perform cron.schedule('buero-followups', '0 6 * * 1-5', 'select public.notify_due_followups()');
end $$;

-- ===========================================================================
-- 5. Kalender-Abo (persönlicher, geheimer Link)
-- ===========================================================================
create table if not exists public.calendar_tokens (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);
alter table public.calendar_tokens enable row level security;
drop policy if exists "Calendar token own" on public.calendar_tokens;
create policy "Calendar token own" on public.calendar_tokens for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
