-- Bestandsverträge: Verträge, die ein Kunde schon vorher hatte (auch bei anderen Gesellschaften).
-- Sie zählen nicht zur Produktion oder Provision, aber für Lücken und Fristen.

create table if not exists public.customer_contracts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  category text not null default 'other' check (category in ('life', 'health', 'property', 'car', 'legal', 'other')),
  sub_category text not null check (length(trim(sub_category)) > 0),
  insurer text,
  policy_number text,
  start_date date,
  premium numeric(10, 2),
  notes text,
  -- Frist bis einschließlich dieses Datums erledigt (Rückruf angelegt oder ausgeblendet)
  handled_until date,
  -- bewusst ohne Fremdschlüssel auf profiles
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists customer_contracts_customer_idx on public.customer_contracts (customer_id);

alter table public.customer_contracts enable row level security;
create policy "customer_contracts select" on public.customer_contracts for select to authenticated
  using (public.is_approved_user());
create policy "customer_contracts insert" on public.customer_contracts for insert to authenticated
  with check (created_by = auth.uid() and public.can_edit_customer(customer_id));
create policy "customer_contracts update" on public.customer_contracts for update to authenticated
  using (public.can_edit_customer(customer_id)) with check (public.can_edit_customer(customer_id));
create policy "customer_contracts delete" on public.customer_contracts for delete to authenticated
  using (public.can_edit_customer(customer_id));

-- Ersteller bleibt fest, Kunde darf nur zu einem bearbeitbaren Kunden wechseln (Policy oben)
create or replace function public.trg_protect_contract_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    new.created_by := old.created_by;
  end if;
  return new;
end $$;
drop trigger if exists protect_contract_owner on public.customer_contracts;
create trigger protect_contract_owner before update on public.customer_contracts
  for each row execute function public.trg_protect_contract_owner();

-- Beim Zusammenführen auch Bestandsverträge übernehmen
create or replace function public.merge_customers(p_keep uuid, p_drop uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  d public.customers;
begin
  if not public.is_admin() then
    raise exception 'Nur Admins können Kunden zusammenführen';
  end if;
  if p_keep = p_drop then
    return;
  end if;
  select * into d from public.customers where id = p_drop;
  if not found then
    raise exception 'Kunde nicht gefunden';
  end if;

  update public.customers k set
    birth_date = coalesce(k.birth_date, d.birth_date),
    phone = coalesce(k.phone, d.phone),
    email = coalesce(k.email, d.email),
    address = coalesce(k.address, d.address),
    household = coalesce(k.household, d.household),
    notes = case when d.notes is null then k.notes when k.notes is null then d.notes else k.notes || E'\n' || d.notes end
  where k.id = p_keep;

  update public.production_entries e
     set customer_id = p_keep, customer_name = k.last_name, customer_firstname = k.first_name
    from public.customers k
   where k.id = p_keep and e.customer_id = p_drop;
  update public.callbacks set customer_id = p_keep where customer_id = p_drop;
  update public.customer_contracts set customer_id = p_keep where customer_id = p_drop;
  delete from public.customers where id = p_drop;
end $$;
