-- Neue Produkte von Nicht-Admins: Team-Standard, LW-Faktor und Lückengruppe kommen vom Bereich.
-- Sonst könnte jemand einen Satz oder Faktor setzen, der für das ganze Team gilt.
create or replace function public.trg_product_insert_defaults()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  a_method text;
  a_rate numeric;
  a_lv numeric;
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  select m, r, l into a_method, a_rate, a_lv from (values
    ('life', 'promille_sum', 8, 1.147), ('health', 'monthly_multiple', 3, 0), ('property', 'courtage_rate', 7.5, 20),
    ('car', 'courtage_rate', 3, 1), ('legal', 'courtage_rate', 5, 20), ('travel', 'percent_yearly', 10, 0),
    ('pet', 'courtage_rate', 7.5, 20), ('business', 'courtage_rate', 10, 20), ('investment', 'percent_sum', 1, 0),
    ('other', 'courtage_rate', 5, 20)
  ) d(area, m, r, l) where d.area = new.area;
  new.default_rate := case when new.calc_method = a_method then a_rate else 0 end;
  new.lv_factor := coalesce(a_lv, 0);
  new.gap_group := null;
  new.active := true;
  return new;
end $$;
drop trigger if exists product_insert_defaults on public.insurance_products;
create trigger product_insert_defaults before insert on public.insurance_products
  for each row execute function public.trg_product_insert_defaults();
