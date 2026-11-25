-- Bestandsverträge: Ablauf und Hauptfälligkeit, damit Kündigungsfristen nicht nur aus dem Beginn geschätzt werden
alter table public.customer_contracts
  add column if not exists end_date date,
  add column if not exists main_due date;

comment on column public.customer_contracts.end_date is 'Ablauf des Vertrags (erste Kündigungsmöglichkeit)';
comment on column public.customer_contracts.main_due is 'Hauptfälligkeit; zählen nur Tag und Monat';
