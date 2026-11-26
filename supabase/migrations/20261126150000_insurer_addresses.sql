-- Anschriften der Versicherungsgesellschaften für Kündigungsschreiben.
-- Einmal eingetragen, steht die Anschrift beim nächsten Brief an dieselbe Gesellschaft schon drin.
create table if not exists public.insurer_addresses (
  name text primary key check (length(btrim(name)) > 0),
  address text not null check (length(btrim(address)) > 0),
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.insurer_addresses enable row level security;

drop policy if exists "insurer_addresses select" on public.insurer_addresses;
create policy "insurer_addresses select" on public.insurer_addresses for select to authenticated
  using (public.is_approved_user());

drop policy if exists "insurer_addresses insert" on public.insurer_addresses;
create policy "insurer_addresses insert" on public.insurer_addresses for insert to authenticated
  with check (public.is_approved_user());

drop policy if exists "insurer_addresses update" on public.insurer_addresses;
create policy "insurer_addresses update" on public.insurer_addresses for update to authenticated
  using (public.is_approved_user()) with check (public.is_approved_user());

revoke all on public.insurer_addresses from anon;
