-- Kundenzuordnung nur, wenn der Name im Vertrag zum Kunden passt (auch beim Anlegen),
-- damit niemand einen eigenen Vertrag an einen fremden Kunden hängt, um ihn bearbeiten zu dürfen.
create or replace function public.trg_link_entry_customer()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  k text;
begin
  if nullif(trim(coalesce(new.customer_name, '')), '') is null then
    new.customer_id := null;
    return new;
  end if;
  k := lower(trim(new.customer_name)) || '|' || lower(trim(coalesce(new.customer_firstname, '')));

  if new.customer_id is not null
     and exists (select 1 from public.customers c where c.id = new.customer_id and c.name_key = k) then
    return new;
  end if;

  new.customer_id := null;
  select id into new.customer_id from public.customers where name_key = k order by created_at limit 1;
  if new.customer_id is null then
    insert into public.customers (created_by, last_name, first_name)
    values (coalesce(auth.uid(), new.user_id), trim(new.customer_name), nullif(trim(coalesce(new.customer_firstname, '')), ''))
    returning id into new.customer_id;
  end if;
  return new;
end $$;

-- "Angelegt von" kann nur ein Admin ändern
create or replace function public.trg_protect_customer_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    new.created_by := old.created_by;
  end if;
  return new;
end $$;

drop trigger if exists protect_customer_owner on public.customers;
create trigger protect_customer_owner
  before update on public.customers
  for each row execute function public.trg_protect_customer_owner();
