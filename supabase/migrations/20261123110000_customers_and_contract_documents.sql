-- Kunden als eigener Datensatz und mehrere Dokumente je Vertrag

-- ---------------------------------------------------------------------------
-- 1. Kunden
-- ---------------------------------------------------------------------------
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- bewusst ohne Fremdschlüssel auf profiles (siehe profiles(...)-Embeds)
  created_by uuid default auth.uid(),
  last_name text not null check (length(trim(last_name)) > 0),
  first_name text,
  birth_date date,
  phone text,
  email text,
  address text,
  household text,
  notes text,
  name_key text generated always as (lower(trim(last_name)) || '|' || lower(trim(coalesce(first_name, '')))) stored
);
create index if not exists customers_name_key_idx on public.customers (name_key);

alter table public.customers enable row level security;
create policy "customers select" on public.customers for select to authenticated using (true);
create policy "customers insert" on public.customers for insert to authenticated with check (true);
create policy "customers update" on public.customers for update to authenticated using (true) with check (true);
create policy "customers delete" on public.customers for delete to authenticated using (created_by = auth.uid() or public.is_admin());

alter table public.production_entries add column if not exists customer_id uuid references public.customers(id) on delete set null;
create index if not exists production_entries_customer_idx on public.production_entries (customer_id);
alter table public.callbacks add column if not exists customer_id uuid references public.customers(id) on delete set null;
create index if not exists callbacks_customer_idx on public.callbacks (customer_id);

-- Vertrag ohne Kunde: passenden Kunden per Name finden oder anlegen
create or replace function public.trg_link_entry_customer()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  k text;
begin
  if nullif(trim(coalesce(new.customer_name, '')), '') is null then
    return new;
  end if;
  k := lower(trim(new.customer_name)) || '|' || lower(trim(coalesce(new.customer_firstname, '')));

  if new.customer_id is not null then
    -- Name im Vertrag geändert und passt nicht mehr zum Kunden: neu zuordnen
    if tg_op = 'UPDATE' and new.customer_id is not distinct from old.customer_id
       and not exists (select 1 from public.customers c where c.id = new.customer_id and c.name_key = k) then
      new.customer_id := null;
    else
      return new;
    end if;
  end if;

  select id into new.customer_id from public.customers where name_key = k order by created_at limit 1;
  if new.customer_id is null then
    insert into public.customers (created_by, last_name, first_name)
    values (coalesce(auth.uid(), new.user_id), trim(new.customer_name), nullif(trim(coalesce(new.customer_firstname, '')), ''))
    returning id into new.customer_id;
  end if;
  return new;
end $$;

drop trigger if exists link_entry_customer on public.production_entries;
create trigger link_entry_customer
  before insert or update of customer_name, customer_firstname, customer_id on public.production_entries
  for each row execute function public.trg_link_entry_customer();

-- Kunde umbenannt: Namen in den Verträgen mitziehen
create or replace function public.trg_customer_rename()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.production_entries
     set customer_name = new.last_name, customer_firstname = new.first_name
   where customer_id = new.id
     and (customer_name is distinct from new.last_name or customer_firstname is distinct from new.first_name);
  return new;
end $$;

drop trigger if exists customer_rename on public.customers;
create trigger customer_rename
  after update of last_name, first_name on public.customers
  for each row execute function public.trg_customer_rename();

-- Doppelte Kunden zusammenführen (nur Admins)
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
  delete from public.customers where id = p_drop;
end $$;
revoke execute on function public.merge_customers(uuid, uuid) from anon, public;
grant execute on function public.merge_customers(uuid, uuid) to authenticated;

-- Bestehende Verträge verknüpfen (der Trigger legt die Kunden an)
update public.production_entries set customer_id = null where customer_id is null;

-- ---------------------------------------------------------------------------
-- 2. Dokumente je Vertrag
-- ---------------------------------------------------------------------------
create table if not exists public.contract_documents (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.production_entries(id) on delete cascade,
  file_path text not null,
  file_name text not null,
  kind text not null default 'sonstiges' check (kind in ('police', 'antrag', 'beratung', 'sonstiges')),
  -- bewusst ohne Fremdschlüssel auf profiles
  uploaded_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists contract_documents_entry_idx on public.contract_documents (entry_id);

alter table public.contract_documents enable row level security;
create policy "contract_documents select" on public.contract_documents for select to authenticated using (public.can_see_entry(entry_id));
create policy "contract_documents insert" on public.contract_documents for insert to authenticated
  with check (uploaded_by = auth.uid() and public.can_see_entry(entry_id));
create policy "contract_documents delete" on public.contract_documents for delete to authenticated
  using (uploaded_by = auth.uid() or public.is_admin() or public.owns_entry(entry_id));

-- Bisheriges Einzeldokument übernehmen
insert into public.contract_documents (entry_id, file_path, file_name, kind, uploaded_by, created_at)
select e.id, e.document_url, regexp_replace(e.document_url, '^.*/', ''), 'sonstiges', e.user_id, e.created_at
  from public.production_entries e
 where e.document_url is not null and e.document_url <> ''
   and not exists (select 1 from public.contract_documents c where c.entry_id = e.id and c.file_path = e.document_url);

-- Dateien: auch lesbar für alle, die den Vertrag sehen dürfen
drop policy if exists "Production docs: contract members" on storage.objects;
create policy "Production docs: contract members"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'production_docs'
    and exists (
      select 1 from public.contract_documents c
      where c.file_path = storage.objects.name and public.can_see_entry(c.entry_id)
    )
  );
