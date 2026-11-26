-- Daten-Update per Link: Kunde bekommt einen geheimen Link und trägt geänderte Daten selbst ein.
-- Der Link (Token) wird nur als SHA-256 gespeichert, gilt 14 Tage und nur für ein Absenden.
-- Das öffentliche Formular zeigt keine gespeicherten Daten, nur Vorname und Ansprechpartner.
-- Übernommen wird erst nach Prüfung im Büro.

create table if not exists public.customer_update_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  token_hash text not null unique,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  status text not null default 'open' check (status in ('open', 'submitted', 'applied', 'rejected', 'expired')),
  submitted_at timestamptz,
  payload jsonb,
  handled_by uuid references auth.users(id) on delete set null,
  handled_at timestamptz
);
create index if not exists customer_update_requests_customer_idx on public.customer_update_requests (customer_id, created_at desc);
create index if not exists customer_update_requests_status_idx on public.customer_update_requests (status);

alter table public.customer_update_requests enable row level security;

drop policy if exists "customer_update_requests select" on public.customer_update_requests;
create policy "customer_update_requests select" on public.customer_update_requests for select to authenticated
  using (public.can_edit_customer(customer_id));

-- Büro: eingereichte Anfrage als übernommen oder verworfen markieren
drop policy if exists "customer_update_requests update" on public.customer_update_requests;
create policy "customer_update_requests update" on public.customer_update_requests for update to authenticated
  using (public.can_edit_customer(customer_id) and status = 'submitted')
  with check (public.can_edit_customer(customer_id) and status in ('applied', 'rejected'));

revoke insert, update, delete on public.customer_update_requests from authenticated, anon;
revoke select on public.customer_update_requests from anon;
grant update (status, handled_by, handled_at) on public.customer_update_requests to authenticated;

-- Link erzeugen (nur wer den Kunden bearbeiten darf). Ältere offene Links verfallen.
create or replace function public.create_customer_update_link(p_customer uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  t text;
begin
  if not public.can_edit_customer(p_customer) then
    raise exception 'Keine Berechtigung für diesen Kunden';
  end if;
  update public.customer_update_requests set status = 'expired' where customer_id = p_customer and status = 'open';
  t := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.customer_update_requests (customer_id, token_hash, created_by)
  values (p_customer, encode(extensions.digest(t, 'sha256'), 'hex'), auth.uid());
  return t;
end $$;
revoke execute on function public.create_customer_update_link(uuid) from anon, public;
grant execute on function public.create_customer_update_link(uuid) to authenticated;

-- Öffentlich: Formular öffnen. Liefert nur Status, Vorname und Ansprechpartner.
create or replace function public.get_customer_update_form(p_token text)
returns json language plpgsql stable security definer set search_path = public as $$
declare
  r public.customer_update_requests;
  first text;
  advisor text;
begin
  if p_token is null or length(p_token) <> 64 then
    return json_build_object('status', 'invalid');
  end if;
  select * into r from public.customer_update_requests where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if not found then
    return json_build_object('status', 'invalid');
  end if;
  if r.status <> 'open' then
    return json_build_object('status', 'used');
  end if;
  if r.expires_at < now() then
    return json_build_object('status', 'expired');
  end if;
  select c.first_name into first from public.customers c where c.id = r.customer_id;
  select p.full_name into advisor from public.profiles p where p.id = r.created_by;
  return json_build_object('status', 'open', 'first_name', first, 'advisor', advisor);
end $$;
revoke execute on function public.get_customer_update_form(text) from public;
grant execute on function public.get_customer_update_form(text) to anon, authenticated;

-- Öffentlich: Formular absenden. Nur bekannte Felder, Längen begrenzt, einmalig.
create or replace function public.submit_customer_update(p_token text, p_data jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare
  r public.customer_update_requests;
  clean jsonb := '{}'::jsonb;
  k text;
  v text;
begin
  if p_token is null or length(p_token) <> 64 or p_data is null or jsonb_typeof(p_data) <> 'object' then
    return 'invalid';
  end if;
  select * into r from public.customer_update_requests
   where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') for update;
  if not found then
    return 'invalid';
  end if;
  if r.status <> 'open' then
    return 'used';
  end if;
  if r.expires_at < now() then
    update public.customer_update_requests set status = 'expired' where id = r.id;
    return 'expired';
  end if;

  foreach k in array array['address', 'phone', 'email'] loop
    v := nullif(btrim(p_data ->> k), '');
    if v is not null then clean := clean || jsonb_build_object(k, left(v, 300)); end if;
  end loop;
  v := nullif(btrim(p_data ->> 'message'), '');
  if v is not null then clean := clean || jsonb_build_object('message', left(v, 2000)); end if;
  v := p_data ->> 'marital_status';
  if v in ('single', 'married', 'partnership', 'divorced', 'widowed') then clean := clean || jsonb_build_object('marital_status', v); end if;
  v := p_data ->> 'occupation';
  if v in ('employee', 'self_employed', 'civil_servant', 'trainee', 'retired', 'not_working') then clean := clean || jsonb_build_object('occupation', v); end if;
  v := p_data ->> 'housing';
  if v in ('rent', 'own_flat', 'own_house', 'with_parents') then clean := clean || jsonb_build_object('housing', v); end if;
  v := p_data ->> 'children';
  if v ~ '^\d{1,2}$' and v::int <= 20 then clean := clean || jsonb_build_object('children', v::int); end if;

  if clean = '{}'::jsonb then
    return 'empty';
  end if;
  update public.customer_update_requests set status = 'submitted', submitted_at = now(), payload = clean where id = r.id;
  return 'ok';
end $$;
revoke execute on function public.submit_customer_update(text, jsonb) from public;
grant execute on function public.submit_customer_update(text, jsonb) to anon, authenticated;
