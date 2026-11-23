-- Produktkatalog, Firmenkunden, Lebenslage und Lückenregeln

-- ---------------------------------------------------------------------------
-- 1. Produktkatalog
-- ---------------------------------------------------------------------------
create table if not exists public.insurance_products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  area text not null check (area in ('life', 'health', 'property', 'car', 'legal', 'travel', 'pet', 'business', 'investment', 'other')),
  calc_method text not null check (calc_method in ('promille_sum', 'monthly_multiple', 'percent_yearly', 'courtage_rate', 'percent_sum', 'fixed')),
  lv_factor numeric not null default 0 check (lv_factor >= 0),
  -- Team-Standard; jede Person kann in user_commission_settings abweichen
  default_rate numeric not null default 0 check (default_rate >= 0),
  gap_group text,
  aliases text,
  active boolean not null default true,
  -- bewusst ohne Fremdschlüssel auf profiles
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index if not exists insurance_products_name_key on public.insurance_products (lower(trim(name)));

alter table public.insurance_products enable row level security;
create policy "insurance_products select" on public.insurance_products for select to authenticated using (true);
create policy "insurance_products insert" on public.insurance_products for insert to authenticated
  with check (public.is_approved_user() and created_by = auth.uid() and active);
create policy "insurance_products update" on public.insurance_products for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "insurance_products delete" on public.insurance_products for delete to authenticated
  using (public.is_admin());

-- Umbenennen oder Bereich wechseln: Verträge, Sätze und Leads mitziehen
create or replace function public.trg_product_rename()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.name is distinct from old.name or new.area is distinct from old.area then
    update public.production_entries set sub_category = new.name, category = new.area where sub_category = old.name;
    update public.customer_contracts set sub_category = new.name, category = new.area where sub_category = old.name;
    update public.user_commission_settings set sub_category = new.name, category = new.area where sub_category = old.name;
    update public.leads set product = new.name where product = old.name;
  end if;
  return new;
end $$;
drop trigger if exists product_rename on public.insurance_products;
create trigger product_rename after update of name, area on public.insurance_products
  for each row execute function public.trg_product_rename();

-- Bestandsverträge: neue Bereiche zulassen
alter table public.customer_contracts drop constraint if exists customer_contracts_category_check;
alter table public.customer_contracts add constraint customer_contracts_category_check
  check (category in ('life', 'health', 'property', 'car', 'legal', 'travel', 'pet', 'business', 'investment', 'other'));

-- ---------------------------------------------------------------------------
-- 2. Firmenkunden und Lebenslage
-- ---------------------------------------------------------------------------
alter table public.customers
  add column if not exists customer_type text not null default 'person' check (customer_type in ('person', 'company')),
  add column if not exists contact_person text,
  add column if not exists industry text,
  add column if not exists employees integer check (employees >= 0),
  add column if not exists occupation text check (occupation in ('employee', 'self_employed', 'civil_servant', 'trainee', 'retired', 'not_working')),
  add column if not exists marital_status text check (marital_status in ('single', 'married', 'partnership', 'divorced', 'widowed')),
  add column if not exists children integer check (children >= 0),
  add column if not exists housing text check (housing in ('rent', 'own_flat', 'own_house', 'with_parents')),
  add column if not exists vehicles text[] not null default '{}',
  add column if not exists pets text[] not null default '{}';

-- ---------------------------------------------------------------------------
-- 3. Lückenregeln
-- ---------------------------------------------------------------------------
create table if not exists public.gap_rules (
  id uuid primary key default gen_random_uuid(),
  gap_group text not null check (length(trim(gap_group)) > 0),
  label text not null check (length(trim(label)) > 0),
  customer_type text not null default 'person' check (customer_type in ('person', 'company')),
  condition text not null default 'always' check (condition in ('always', 'own_home', 'rent', 'own_household', 'car', 'motorcycle', 'dog', 'cat', 'horse', 'any_pet', 'children', 'partner', 'employees')),
  min_age integer,
  max_age integer,
  occupations text[],
  active boolean not null default true,
  sort integer not null default 0
);
alter table public.gap_rules enable row level security;
create policy "gap_rules select" on public.gap_rules for select to authenticated using (true);
create policy "gap_rules admin insert" on public.gap_rules for insert to authenticated with check (public.is_admin());
create policy "gap_rules admin update" on public.gap_rules for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "gap_rules admin delete" on public.gap_rules for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 4. Startbestand (aus src/lib/productCatalog.json und src/lib/gaps.ts)
-- ---------------------------------------------------------------------------
insert into public.insurance_products (name, area, calc_method, lv_factor, default_rate, gap_group, aliases) values
  ('Leben', 'life', 'promille_sum', 1.147, 8, 'av', 'Lebensversicherung Altersvorsorge'),
  ('BU', 'life', 'promille_sum', 1.147, 8, 'akv', 'Berufsunfähigkeitsversicherung'),
  ('Fondsrente', 'life', 'promille_sum', 1.147, 8, 'av', 'Fondsgebundene Rentenversicherung'),
  ('Klassische Rentenversicherung', 'life', 'promille_sum', 1.147, 8, 'av', 'Private Rente'),
  ('Riester-Rente', 'life', 'promille_sum', 1.147, 8, 'av', 'Zulagenrente'),
  ('Rürup-Rente (Basisrente)', 'life', 'promille_sum', 1.147, 8, 'av', 'Basisrente'),
  ('Betriebliche Altersversorgung (bAV)', 'life', 'promille_sum', 1.147, 8, 'av', 'Entgeltumwandlung'),
  ('Direktversicherung', 'life', 'promille_sum', 1.147, 8, 'av', 'bAV'),
  ('Unterstützungskasse', 'life', 'promille_sum', 1.147, 8, 'av', 'bAV'),
  ('Kapitallebensversicherung', 'life', 'promille_sum', 1.147, 8, 'av', null),
  ('Fondsgebundene Lebensversicherung', 'life', 'promille_sum', 1.147, 8, 'av', null),
  ('Sofortrente', 'life', 'promille_sum', 1.147, 8, 'av', 'Einmalbeitrag'),
  ('Risikolebensversicherung', 'life', 'promille_sum', 1.147, 8, 'rlv', 'RLV Hinterbliebene Todesfall'),
  ('Sterbegeldversicherung', 'life', 'promille_sum', 1.147, 8, null, 'Bestattung'),
  ('Grundfähigkeitsversicherung', 'life', 'promille_sum', 1.147, 8, 'akv', 'GF Arbeitskraft'),
  ('Erwerbsunfähigkeitsversicherung', 'life', 'promille_sum', 1.147, 8, 'akv', 'EU Arbeitskraft'),
  ('Dienstunfähigkeitsversicherung', 'life', 'promille_sum', 1.147, 8, 'akv', 'DU Beamte'),
  ('Existenzschutzversicherung', 'life', 'promille_sum', 1.147, 8, 'akv', 'Multi-Risk Arbeitskraft'),
  ('Schwere-Krankheiten-Versicherung', 'life', 'promille_sum', 1.147, 8, null, 'Dread Disease'),
  ('Kinderinvaliditätsversicherung', 'life', 'courtage_rate', 20, 7.5, 'kinv', 'Kinder Invalidität'),
  ('Kindervorsorge / Ausbildungsversicherung', 'life', 'promille_sum', 1.147, 8, 'kinder', 'Kinder Sparen'),
  ('Pflegerentenversicherung', 'life', 'promille_sum', 1.147, 8, 'pflege', 'Pflegerente'),
  ('Restschuldversicherung', 'life', 'percent_yearly', 0, 10, null, 'Kredit Absicherung'),
  ('KV Voll', 'health', 'monthly_multiple', 0, 3, 'kv', 'Private Krankenvollversicherung PKV'),
  ('KV Zusatz', 'health', 'monthly_multiple', 0, 3, null, 'Krankenzusatzversicherung'),
  ('Reise-KV', 'health', 'percent_yearly', 0, 10, null, 'Auslandsreisekrankenversicherung'),
  ('Zahnzusatzversicherung', 'health', 'monthly_multiple', 0, 3, null, 'Zahnersatz Zähne'),
  ('Stationäre Zusatzversicherung', 'health', 'monthly_multiple', 0, 3, null, 'Krankenhaus Chefarzt Einbettzimmer'),
  ('Ambulante Zusatzversicherung', 'health', 'monthly_multiple', 0, 3, null, 'Heilpraktiker Vorsorge'),
  ('Sehhilfenversicherung', 'health', 'monthly_multiple', 0, 3, null, 'Brille Kontaktlinsen'),
  ('Krankentagegeld', 'health', 'monthly_multiple', 0, 3, null, 'Verdienstausfall'),
  ('Krankenhaustagegeld', 'health', 'monthly_multiple', 0, 3, null, null),
  ('Pflegezusatzversicherung', 'health', 'monthly_multiple', 0, 3, 'pflege', 'Pflegetagegeld'),
  ('Geförderte Pflegezusatz (Pflege-Bahr)', 'health', 'monthly_multiple', 0, 3, 'pflege', 'Pflege Bahr'),
  ('Beihilfeergänzung', 'health', 'monthly_multiple', 0, 3, null, 'Beamte Beihilfe'),
  ('Anwartschaftsversicherung', 'health', 'monthly_multiple', 0, 3, null, 'Ruhen PKV'),
  ('Langzeit-Auslandskrankenversicherung', 'health', 'monthly_multiple', 0, 3, null, 'Work and Travel Expat'),
  ('PHV', 'property', 'courtage_rate', 20, 7.5, 'phv', 'Privathaftpflicht Haftpflicht'),
  ('HR', 'property', 'courtage_rate', 20, 7.5, 'hr', 'Hausratversicherung'),
  ('UNF', 'property', 'courtage_rate', 20, 7.5, 'unf', 'Unfallversicherung'),
  ('Sach', 'property', 'courtage_rate', 20, 7.5, null, 'Sonstige Sachversicherung'),
  ('Wohngebäudeversicherung', 'property', 'courtage_rate', 20, 7.5, 'wg', 'Haus Gebäude'),
  ('Elementarschadenversicherung', 'property', 'courtage_rate', 20, 7.5, null, 'Hochwasser Starkregen'),
  ('Glasversicherung', 'property', 'courtage_rate', 20, 7.5, null, 'Glasbruch'),
  ('Photovoltaikversicherung', 'property', 'courtage_rate', 20, 7.5, null, 'PV Solar Anlage'),
  ('Haus- und Grundbesitzerhaftpflicht', 'property', 'courtage_rate', 20, 7.5, null, 'Vermieter Grundstück'),
  ('Gewässerschadenhaftpflicht', 'property', 'courtage_rate', 20, 7.5, null, 'Öltank Heizöl'),
  ('Bauherrenhaftpflicht', 'property', 'courtage_rate', 20, 7.5, null, 'Hausbau'),
  ('Bauleistungsversicherung', 'property', 'courtage_rate', 20, 7.5, null, 'Hausbau Rohbau'),
  ('Feuerrohbauversicherung', 'property', 'courtage_rate', 20, 7.5, null, 'Hausbau'),
  ('Fahrradversicherung', 'property', 'courtage_rate', 20, 7.5, null, 'E-Bike Pedelec Diebstahl'),
  ('Musikinstrumentenversicherung', 'property', 'courtage_rate', 20, 7.5, null, 'Instrument Gitarre Klavier'),
  ('Elektronikversicherung', 'property', 'courtage_rate', 20, 7.5, null, 'Laptop Kamera Geräte'),
  ('Handyversicherung', 'property', 'courtage_rate', 20, 7.5, null, 'Smartphone Display'),
  ('Wertsachen- und Schmuckversicherung', 'property', 'courtage_rate', 20, 7.5, null, 'Kunst Schmuck Uhren'),
  ('Diensthaftpflicht', 'property', 'courtage_rate', 20, 7.5, null, 'Amtshaftpflicht Beamte Lehrer'),
  ('Schlüsselverlustversicherung', 'property', 'courtage_rate', 20, 7.5, null, 'Schlüssel'),
  ('Jagdhaftpflicht', 'property', 'courtage_rate', 20, 7.5, null, 'Jäger'),
  ('Drohnenhaftpflicht', 'property', 'courtage_rate', 20, 7.5, null, 'Drohne Modellflug'),
  ('Bootshaftpflicht', 'property', 'courtage_rate', 20, 7.5, null, 'Wassersport Segeln'),
  ('Wassersportkaskoversicherung', 'property', 'courtage_rate', 20, 7.5, null, 'Boot Kasko'),
  ('Private Cyberversicherung', 'property', 'courtage_rate', 20, 7.5, null, 'Internet Identität'),
  ('Kinderunfallversicherung', 'property', 'courtage_rate', 20, 7.5, 'unf', 'Unfall Kinder'),
  ('Seniorenunfallversicherung', 'property', 'courtage_rate', 20, 7.5, 'unf', 'Unfall Senioren'),
  ('KFZ', 'car', 'courtage_rate', 1, 3, 'kfz', 'Autoversicherung PKW Kfz-Haftpflicht Kasko'),
  ('Motorradversicherung', 'car', 'courtage_rate', 1, 3, 'krad', 'Motorrad Krad'),
  ('Rollerversicherung (Mofa-Kennzeichen)', 'car', 'courtage_rate', 1, 3, null, 'Roller Moped'),
  ('E-Scooter-Versicherung', 'car', 'courtage_rate', 1, 3, null, 'Scooter Kennzeichen'),
  ('Wohnmobilversicherung', 'car', 'courtage_rate', 1, 3, null, 'Camper'),
  ('Wohnwagenversicherung', 'car', 'courtage_rate', 1, 3, null, 'Caravan'),
  ('Anhängerversicherung', 'car', 'courtage_rate', 1, 3, null, 'Anhänger'),
  ('Oldtimerversicherung', 'car', 'courtage_rate', 1, 3, null, 'Klassiker'),
  ('Kfz-Schutzbrief', 'car', 'courtage_rate', 1, 3, null, 'Pannenhilfe'),
  ('GAP-Versicherung', 'car', 'courtage_rate', 1, 3, null, 'Leasing Finanzierung'),
  ('Fahrerschutzversicherung', 'car', 'courtage_rate', 1, 3, null, 'Fahrer Unfall'),
  ('Rechtsschutz', 'legal', 'courtage_rate', 20, 5, 'rs', 'Rechtsschutzversicherung Privat Beruf Verkehr'),
  ('Verkehrsrechtsschutz', 'legal', 'courtage_rate', 20, 5, null, 'Verkehr'),
  ('Mietrechtsschutz', 'legal', 'courtage_rate', 20, 5, null, 'Wohnungs- und Grundstücksrechtsschutz Vermieter'),
  ('Berufsrechtsschutz', 'legal', 'courtage_rate', 20, 5, null, 'Arbeitsrecht'),
  ('Reiserücktrittsversicherung', 'travel', 'percent_yearly', 0, 10, null, 'Storno Reise'),
  ('Reiseabbruchversicherung', 'travel', 'percent_yearly', 0, 10, null, null),
  ('Reisegepäckversicherung', 'travel', 'percent_yearly', 0, 10, null, 'Koffer'),
  ('Jahres-Reiseschutz (Paket)', 'travel', 'percent_yearly', 0, 10, null, 'Reisepaket'),
  ('Hundehaftpflicht', 'pet', 'courtage_rate', 20, 7.5, 'hund', 'Tierhalterhaftpflicht Hund'),
  ('Pferdehaftpflicht', 'pet', 'courtage_rate', 20, 7.5, 'pferd', 'Tierhalterhaftpflicht Pferd'),
  ('Hunde-OP-Versicherung', 'pet', 'courtage_rate', 20, 7.5, 'tierkv', 'Tier OP Hund'),
  ('Hundekrankenversicherung', 'pet', 'courtage_rate', 20, 7.5, 'tierkv', 'Tierkranken Hund'),
  ('Katzen-OP-Versicherung', 'pet', 'courtage_rate', 20, 7.5, 'tierkv', 'Tier OP Katze'),
  ('Katzenkrankenversicherung', 'pet', 'courtage_rate', 20, 7.5, 'tierkv', 'Tierkranken Katze'),
  ('Pferde-OP-Versicherung', 'pet', 'courtage_rate', 20, 7.5, 'tierkv', 'Tier OP Pferd'),
  ('Betriebshaftpflicht', 'business', 'courtage_rate', 20, 10, 'bhv', 'Firmenhaftpflicht Gewerbe'),
  ('Berufshaftpflicht (Vermögensschaden)', 'business', 'courtage_rate', 20, 10, 'vsh', 'VSH Freiberufler'),
  ('Produkthaftpflicht', 'business', 'courtage_rate', 20, 10, null, null),
  ('Umwelthaftpflicht', 'business', 'courtage_rate', 20, 10, null, null),
  ('Veranstaltungshaftpflicht', 'business', 'courtage_rate', 20, 10, null, 'Event'),
  ('Inhaltsversicherung', 'business', 'courtage_rate', 20, 10, 'inhalt', 'Geschäftsinhalt Betriebsinhalt'),
  ('Betriebsunterbrechungsversicherung', 'business', 'courtage_rate', 20, 10, 'ertrag', 'Ertragsausfall'),
  ('Gewerbliche Gebäudeversicherung', 'business', 'courtage_rate', 20, 10, null, 'Firmengebäude'),
  ('Elektronikversicherung (Gewerbe)', 'business', 'courtage_rate', 20, 10, null, 'IT Hardware'),
  ('Maschinenversicherung', 'business', 'courtage_rate', 20, 10, null, 'Maschinenbruch'),
  ('Cyberversicherung (Gewerbe)', 'business', 'courtage_rate', 20, 10, 'cyber', 'Hacker Datenschutz'),
  ('D&O-Versicherung', 'business', 'courtage_rate', 20, 10, null, 'Managerhaftpflicht'),
  ('Firmenrechtsschutz', 'business', 'courtage_rate', 20, 10, 'gewerbe_rs', 'Rechtsschutz Gewerbe'),
  ('Transportversicherung', 'business', 'courtage_rate', 20, 10, null, 'Waren Fracht'),
  ('Werkverkehrsversicherung', 'business', 'courtage_rate', 20, 10, null, 'Transport eigene Fahrzeuge'),
  ('Flottenversicherung', 'business', 'courtage_rate', 20, 10, null, 'Firmen-KFZ Fuhrpark'),
  ('Gruppenunfallversicherung', 'business', 'courtage_rate', 20, 10, null, 'Mitarbeiter Unfall'),
  ('Betriebliche Krankenversicherung (bKV)', 'business', 'courtage_rate', 20, 10, 'bkv', 'Mitarbeiter Gesundheit'),
  ('Warenkreditversicherung', 'business', 'courtage_rate', 20, 10, null, 'Forderungsausfall'),
  ('Kautionsversicherung', 'business', 'courtage_rate', 20, 10, null, 'Bürgschaft Avale'),
  ('Ausstellungsversicherung', 'business', 'courtage_rate', 20, 10, null, 'Messe'),
  ('Fondsdepot', 'investment', 'percent_sum', 0, 1, null, 'Investmentfonds Einmalanlage'),
  ('Fondssparplan', 'investment', 'percent_yearly', 0, 3, null, 'Sparplan'),
  ('ETF-Sparplan', 'investment', 'percent_yearly', 0, 1, null, 'Indexfonds'),
  ('Vermögensverwaltung', 'investment', 'percent_sum', 0, 1, null, 'Depot'),
  ('Vermögenswirksame Leistungen (VL)', 'investment', 'fixed', 0, 50, null, 'VL Sparen'),
  ('Bausparvertrag', 'investment', 'percent_sum', 0, 1, null, 'Bausparen Wohn-Riester'),
  ('Baufinanzierung', 'investment', 'percent_sum', 0, 1, null, 'Immobilienkredit Hypothek'),
  ('Anschlussfinanzierung', 'investment', 'percent_sum', 0, 1, null, 'Forward-Darlehen'),
  ('Privatkredit', 'investment', 'percent_sum', 0, 1, null, 'Ratenkredit Konsumkredit'),
  ('Sonstige', 'other', 'courtage_rate', 20, 5, null, null),
  ('Mietkautionsbürgschaft', 'other', 'percent_yearly', 0, 15, null, 'Mietkaution')
on conflict do nothing;

insert into public.gap_rules (gap_group, label, customer_type, condition, min_age, max_age, occupations, sort) values
  ('phv', 'PHV', 'person', 'always', null, null, null, 10),
  ('hr', 'HR', 'person', 'own_household', null, null, null, 20),
  ('rs', 'Rechtsschutz', 'person', 'always', null, null, null, 30),
  ('unf', 'UNF', 'person', 'always', null, null, null, 40),
  ('akv', 'BU', 'person', 'always', null, 55, array['employee','self_employed','civil_servant','trainee']::text[], 50),
  ('av', 'Altersvorsorge', 'person', 'always', null, 60, array['employee','self_employed','civil_servant','trainee']::text[], 60),
  ('kv', 'Krankenvoll', 'person', 'always', null, null, array['self_employed','civil_servant']::text[], 70),
  ('pflege', 'Pflege', 'person', 'always', 40, null, null, 80),
  ('wg', 'Wohngebäude', 'person', 'own_home', null, null, null, 90),
  ('rlv', 'Risiko-LV', 'person', 'children', null, 65, null, 100),
  ('rlv', 'Risiko-LV', 'person', 'partner', null, 65, null, 101),
  ('kinv', 'Kinderinvalidität', 'person', 'children', null, null, null, 110),
  ('kfz', 'KFZ', 'person', 'car', null, null, null, 120),
  ('krad', 'Motorrad', 'person', 'motorcycle', null, null, null, 130),
  ('hund', 'Hundehaftpflicht', 'person', 'dog', null, null, null, 140),
  ('pferd', 'Pferdehaftpflicht', 'person', 'horse', null, null, null, 150),
  ('tierkv', 'Tier-OP', 'person', 'any_pet', null, null, null, 160),
  ('bhv', 'Betriebshaftpflicht', 'company', 'always', null, null, null, 200),
  ('inhalt', 'Inhalt', 'company', 'always', null, null, null, 210),
  ('ertrag', 'Betriebsunterbrechung', 'company', 'always', null, null, null, 220),
  ('cyber', 'Cyber', 'company', 'always', null, null, null, 230),
  ('gewerbe_rs', 'Firmenrechtsschutz', 'company', 'always', null, null, null, 240),
  ('av', 'bAV', 'company', 'employees', null, null, null, 250),
  ('bkv', 'bKV', 'company', 'employees', null, null, null, 260);
