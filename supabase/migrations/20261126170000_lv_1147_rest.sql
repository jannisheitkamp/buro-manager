-- Restliche Verträge mit Faktor 1,147 (außerhalb von Leben) auf 1,142 umstellen.
-- Lebenswerte proportional umrechnen (Basis bleibt gleich).
update public.production_entries
   set life_values = life_values / 1.147 * 1.142,
       life_value_factor = 1.142
 where life_value_factor = 1.147;
