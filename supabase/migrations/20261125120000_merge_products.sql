-- Produktkatalog: doppelte Produkte zusammenführen (nur Admins)
-- Verträge, Bestandsverträge, Leads und eigene Sätze wandern zum bleibenden Produkt,
-- der alte Name wird Suchbegriff, das doppelte Produkt wird gelöscht.

create or replace function public.merge_products(p_keep uuid, p_drop uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  k public.insurance_products;
  d public.insurance_products;
begin
  if not public.is_admin() then
    raise exception 'Nur Admins können Produkte zusammenführen';
  end if;
  if p_keep = p_drop then
    return;
  end if;
  select * into k from public.insurance_products where id = p_keep;
  select * into d from public.insurance_products where id = p_drop;
  if k.id is null or d.id is null then
    raise exception 'Produkt nicht gefunden';
  end if;

  update public.production_entries set sub_category = k.name, category = k.area where sub_category = d.name;
  update public.customer_contracts set sub_category = k.name, category = k.area where sub_category = d.name;
  update public.leads set product = k.name where product = d.name;

  -- Eigene Sätze: wer schon einen Satz für das bleibende Produkt hat, behält diesen
  delete from public.user_commission_settings s
   where s.sub_category = d.name
     and exists (select 1 from public.user_commission_settings o where o.user_id = s.user_id and o.sub_category = k.name);
  update public.user_commission_settings set sub_category = k.name, category = k.area where sub_category = d.name;

  -- Alten Namen als Suchbegriff merken, damit man das Produkt weiter darunter findet
  update public.insurance_products
     set aliases = nullif(trim(concat_ws(' ', aliases, d.name, d.aliases)), ''),
         gap_group = coalesce(gap_group, d.gap_group)
   where id = k.id;

  delete from public.insurance_products where id = d.id;
end $$;

revoke execute on function public.merge_products(uuid, uuid) from anon, public;
grant execute on function public.merge_products(uuid, uuid) to authenticated;

-- Nutzung je Produkt für die Katalogpflege (zählt alle Verträge, auch fremde; nur Zahlen, keine Daten)
create or replace function public.product_usage()
returns table (name text, entries bigint, contracts bigint, leads bigint)
language sql stable security definer set search_path = public as $$
  select p.name,
         (select count(*) from public.production_entries e where e.sub_category = p.name),
         (select count(*) from public.customer_contracts c where c.sub_category = p.name),
         (select count(*) from public.leads l where l.product = p.name)
    from public.insurance_products p
   where public.is_admin();
$$;

revoke execute on function public.product_usage() from anon, public;
grant execute on function public.product_usage() to authenticated;
