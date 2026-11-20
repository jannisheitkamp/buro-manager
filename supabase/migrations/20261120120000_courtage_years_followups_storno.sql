-- Storno-Verlauf
alter table public.production_entries
  add column if not exists cancelled_at date,
  add column if not exists cancel_reason text,
  add column if not exists cancel_note text;

-- Sach-Courtage: Auszahlung je Vertrag und Jahr (zum 31.12.)
create table if not exists public.courtage_payouts (
  entry_id uuid not null references public.production_entries(id) on delete cascade,
  year integer not null,
  received_date date not null default current_date,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (entry_id, year)
);

-- Wiedervorlagen zu Vertragsfristen: erledigt per Rückruf oder ausgeblendet
create table if not exists public.contract_followups (
  entry_id uuid not null references public.production_entries(id) on delete cascade,
  due_date date not null,
  state text not null check (state in ('callback', 'dismissed')),
  callback_id uuid references public.callbacks(id) on delete set null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (entry_id, due_date)
);

alter table public.courtage_payouts enable row level security;
alter table public.contract_followups enable row level security;

-- Lesen: wer den Vertrag abschließt oder betreut, und Admins
create or replace function public.can_see_entry(e uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.production_entries p
    where p.id = e and (p.user_id = auth.uid() or p.managed_by = auth.uid())
  ) or exists (
    select 1 from public.profiles where id = auth.uid() and 'admin' = any(roles)
  );
$$;

-- Schreiben: wer den Vertrag abgeschlossen hat
create or replace function public.owns_entry(e uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.production_entries p where p.id = e and p.user_id = auth.uid());
$$;

revoke all on function public.can_see_entry(uuid) from public, anon;
revoke all on function public.owns_entry(uuid) from public, anon;
grant execute on function public.can_see_entry(uuid) to authenticated;
grant execute on function public.owns_entry(uuid) to authenticated;

create policy "courtage_payouts select" on public.courtage_payouts for select to authenticated using (public.can_see_entry(entry_id));
create policy "courtage_payouts insert" on public.courtage_payouts for insert to authenticated with check (public.owns_entry(entry_id));
create policy "courtage_payouts delete" on public.courtage_payouts for delete to authenticated using (public.owns_entry(entry_id));

create policy "contract_followups select" on public.contract_followups for select to authenticated using (public.can_see_entry(entry_id));
create policy "contract_followups insert" on public.contract_followups for insert to authenticated with check (public.can_see_entry(entry_id));
create policy "contract_followups delete" on public.contract_followups for delete to authenticated using (public.can_see_entry(entry_id));

-- Bisherige Courtage-Eingänge ins Jahr des Vertragsbeginns übernehmen
insert into public.courtage_payouts (entry_id, year, received_date, created_by)
select id, extract(year from coalesce(start_date, submission_date))::int, commission_received_date, user_id
from public.production_entries
where sub_category in ('PHV','HR','UNF','Sach','KFZ','Rechtsschutz','Sonstige')
  and commission_received_date is not null
on conflict do nothing;
