-- Lebenswerte-Faktor Leben & Vorsorge: 1,142 statt 1,147 (Katalog und bestehende Verträge).
-- BU: Provision und Lebenswerte auf höchstens 45 statt 35 Jahre. Alle anderen (z. B. fondsgebunden) bleiben bei 35.

update public.insurance_products set lv_factor = 1.142 where area = 'life' and lv_factor = 1.147;

create or replace function public.trg_product_insert_defaults()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  a_method text;
  a_rate numeric;
  a_lv numeric;
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  select m, r, l into a_method, a_rate, a_lv from (values
    ('life', 'promille_sum', 8, 1.142), ('health', 'monthly_multiple', 3, 0), ('property', 'courtage_rate', 7.5, 20),
    ('car', 'courtage_rate', 3, 1), ('legal', 'courtage_rate', 5, 20), ('travel', 'percent_yearly', 10, 0),
    ('pet', 'courtage_rate', 7.5, 20), ('business', 'courtage_rate', 10, 20), ('investment', 'percent_sum', 1, 0),
    ('other', 'courtage_rate', 5, 20)
  ) d(area, m, r, l) where d.area = new.area;
  new.default_rate := case when new.calc_method = a_method then a_rate else 0 end;
  new.lv_factor := coalesce(a_lv, 0);
  new.gap_group := null;
  new.active := true;
  return new;
end $function$;

-- Bestehende Lebensverträge: Faktor umstellen
update public.production_entries set life_value_factor = 1.142
 where category = 'life' and life_value_factor = 1.147;

-- Lebensverträge mit Promille-Rechnung neu berechnen (BU 45 Jahre, sonst 35)
update public.production_entries e
   set valuation_sum = v.val,
       commission_amount = v.val * (e.commission_rate / 1000),
       life_values = v.val * e.life_value_factor
  from (
    select x.id,
           x.gross_premium * (case x.payment_method when 'quarterly' then 4 when 'half_yearly' then 2 when 'yearly' then 1 when 'one_time' then 1 else 12 end)
             * least(x.duration, case when x.sub_category = 'BU' then 45 else 35 end) as val
      from public.production_entries x
      join public.insurance_products p on p.name = x.sub_category and p.calc_method = 'promille_sum'
     where x.category = 'life' and x.duration is not null and x.gross_premium is not null
  ) v
 where e.id = v.id;
