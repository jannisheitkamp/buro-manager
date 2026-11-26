-- Berichtsheft (Ausbildungsnachweis): ein Bericht pro Azubi und Woche.
-- Azubi schreibt und reicht ein, der Chef (boss_id) oder ein Admin zeichnet ab oder gibt zurück.
-- user_id/reviewed_by zeigen auf auth.users, nicht auf profiles (kein zweiter FK auf profiles).

create table if not exists public.training_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  company text not null default '',
  training text not null default '',
  school text not null default '',
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'returned')),
  submitted_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start)
);
create index if not exists training_reports_status_idx on public.training_reports (status, week_start);

-- Darf ich Berichte dieser Person abzeichnen? Admin oder ihr Chef.
create or replace function public.can_review_training(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.profiles p where p.id = p_user and p.is_vocational_student and p.boss_id = auth.uid()
  );
$$;
revoke execute on function public.can_review_training(uuid) from anon, public;
grant execute on function public.can_review_training(uuid) to authenticated;

alter table public.training_reports enable row level security;

drop policy if exists "training_reports select" on public.training_reports;
create policy "training_reports select" on public.training_reports for select to authenticated
  using (user_id = auth.uid() or public.can_review_training(user_id));

-- Azubi: eigene Berichte anlegen und bearbeiten, solange sie nicht abgezeichnet sind
drop policy if exists "training_reports insert" on public.training_reports;
create policy "training_reports insert" on public.training_reports for insert to authenticated
  with check (user_id = auth.uid() and status in ('draft', 'submitted'));

drop policy if exists "training_reports update" on public.training_reports;
create policy "training_reports update" on public.training_reports for update to authenticated
  using (user_id = auth.uid() and status in ('draft', 'returned', 'submitted'))
  with check (user_id = auth.uid() and status in ('draft', 'submitted'));

drop policy if exists "training_reports delete" on public.training_reports;
create policy "training_reports delete" on public.training_reports for delete to authenticated
  using (user_id = auth.uid() and status = 'draft');

-- Direkt änderbar sind nur Inhalt und Status; Abzeichnen läuft über review_training_report
revoke insert, update on public.training_reports from authenticated;
grant insert (user_id, week_start, company, training, school, status, submitted_at) on public.training_reports to authenticated;
grant update (company, training, school, status, submitted_at, updated_at) on public.training_reports to authenticated;

-- Abzeichnen oder zurückgeben
create or replace function public.review_training_report(p_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.training_reports;
begin
  select * into r from public.training_reports where id = p_id;
  if not found then
    raise exception 'Bericht nicht gefunden';
  end if;
  if not public.can_review_training(r.user_id) then
    raise exception 'Nur der Chef oder ein Admin kann abzeichnen';
  end if;
  if r.status <> 'submitted' then
    raise exception 'Der Bericht ist nicht eingereicht';
  end if;
  update public.training_reports set
    status = case when p_approve then 'approved' else 'returned' end,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    review_note = nullif(btrim(coalesce(p_note, '')), ''),
    updated_at = now()
  where id = p_id;
end $$;
revoke execute on function public.review_training_report(uuid, boolean, text) from anon, public;
grant execute on function public.review_training_report(uuid, boolean, text) to authenticated;
