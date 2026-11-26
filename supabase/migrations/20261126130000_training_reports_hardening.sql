-- Berichtsheft absichern: Eingereichte Berichte sind für den Azubi gesperrt,
-- Zurückholen und Zeitstempel laufen über den Server, und abgezeichnet wird nur der Stand, den der Chef gesehen hat.

-- Bearbeiten nur als Entwurf oder nach Rückgabe
drop policy if exists "training_reports update" on public.training_reports;
create policy "training_reports update" on public.training_reports for update to authenticated
  using (user_id = auth.uid() and status in ('draft', 'returned'))
  with check (user_id = auth.uid() and status in ('draft', 'submitted'));

-- Zeitstempel setzt der Server, nicht der Browser
revoke insert, update on public.training_reports from authenticated;
grant insert (user_id, week_start, company, training, school, status) on public.training_reports to authenticated;
grant update (company, training, school, status) on public.training_reports to authenticated;

create or replace function public.training_reports_stamp()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if new.status = 'submitted' and (tg_op = 'INSERT' or old.status is distinct from 'submitted') then
    new.submitted_at := now();
  end if;
  return new;
end $$;
drop trigger if exists training_reports_stamp on public.training_reports;
create trigger training_reports_stamp before insert or update on public.training_reports
  for each row execute function public.training_reports_stamp();

-- Eingereichten Bericht zurückholen: nur der Azubi, nur solange er nicht abgezeichnet ist
create or replace function public.withdraw_training_report(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.training_reports set status = 'draft', submitted_at = null
   where id = p_id and user_id = auth.uid() and status = 'submitted';
  if not found then
    raise exception 'Der Bericht kann nicht zurückgeholt werden';
  end if;
end $$;
revoke execute on function public.withdraw_training_report(uuid) from anon, public;
grant execute on function public.withdraw_training_report(uuid) to authenticated;

-- Abzeichnen nur für den Stand, den der Chef gesehen hat (p_seen = updated_at beim Laden)
drop function if exists public.review_training_report(uuid, boolean, text);
create or replace function public.review_training_report(p_id uuid, p_approve boolean, p_seen timestamptz, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.training_reports;
begin
  select * into r from public.training_reports where id = p_id for update;
  if not found then
    raise exception 'Bericht nicht gefunden';
  end if;
  if not public.can_review_training(r.user_id) then
    raise exception 'Nur der Chef oder ein Admin kann abzeichnen';
  end if;
  if r.status <> 'submitted' then
    raise exception 'Der Bericht ist nicht eingereicht';
  end if;
  if r.updated_at is distinct from p_seen then
    raise exception 'Der Bericht wurde inzwischen geändert, bitte neu laden';
  end if;
  update public.training_reports set
    status = case when p_approve then 'approved' else 'returned' end,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    review_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = p_id;
end $$;
revoke execute on function public.review_training_report(uuid, boolean, timestamptz, text) from anon, public;
grant execute on function public.review_training_report(uuid, boolean, timestamptz, text) to authenticated;

-- Niemand zeichnet die eigenen Berichte ab, auch kein Admin, der selbst Azubi ist
create or replace function public.can_review_training(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_user <> auth.uid() and (public.is_admin() or exists (
    select 1 from public.profiles p where p.id = p_user and p.is_vocational_student and p.boss_id = auth.uid()
  ));
$$;
