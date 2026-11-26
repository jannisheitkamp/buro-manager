-- Gesprächsnotizen zur Kundenakte: wer hat wann was mit dem Kunden besprochen.
-- Sichtbar und schreibbar für alle, die den Kunden sehen (can_edit_customer).
-- created_by zeigt bewusst auf auth.users, nicht auf profiles: ein zweiter FK auf profiles
-- macht Verknüpfungen wie profiles(...) mehrdeutig.

create table if not exists public.customer_notes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  body text not null check (length(btrim(body)) > 0),
  created_at timestamptz not null default now()
);
create index if not exists customer_notes_customer_idx on public.customer_notes (customer_id, created_at desc);

alter table public.customer_notes enable row level security;

drop policy if exists "customer_notes select" on public.customer_notes;
create policy "customer_notes select" on public.customer_notes for select to authenticated
  using (public.can_edit_customer(customer_id));

drop policy if exists "customer_notes insert" on public.customer_notes;
create policy "customer_notes insert" on public.customer_notes for insert to authenticated
  with check (created_by = auth.uid() and public.can_edit_customer(customer_id));

-- Löschen: eigene Notiz oder Admin
drop policy if exists "customer_notes delete" on public.customer_notes;
create policy "customer_notes delete" on public.customer_notes for delete to authenticated
  using (public.can_edit_customer(customer_id) and (created_by = auth.uid() or public.is_admin()));

-- Beim Zusammenführen ziehen die Notizen mit
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
  update public.customer_notes set customer_id = p_keep where customer_id = p_drop;
  delete from public.customers where id = p_drop;
end $$;
revoke execute on function public.merge_customers(uuid, uuid) from anon, public;
grant execute on function public.merge_customers(uuid, uuid) to authenticated;
