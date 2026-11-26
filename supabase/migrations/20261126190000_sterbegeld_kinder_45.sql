-- Sterbegeld und Kindervorsorge ebenfalls auf höchstens 45 Jahre. Bestehende Verträge neu berechnen.
update public.production_entries e
   set valuation_sum = v.val,
       commission_amount = v.val * (e.commission_rate / 1000),
       life_values = v.val * e.life_value_factor
  from (
    select x.id,
           x.gross_premium * (case x.payment_method when 'quarterly' then 4 when 'half_yearly' then 2 when 'yearly' then 1 when 'one_time' then 1 else 12 end)
             * least(x.duration, 45) as val
      from public.production_entries x
      join public.insurance_products p on p.name = x.sub_category and p.calc_method = 'promille_sum'
     where x.sub_category in ('Sterbegeldversicherung', 'Kindervorsorge / Ausbildungsversicherung')
       and x.duration is not null and x.gross_premium is not null
  ) v
 where e.id = v.id;
