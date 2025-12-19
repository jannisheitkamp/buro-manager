create table if not exists public.production_entries (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  user_id uuid references auth.users not null,
  
  -- Basic Info
  submission_date date default CURRENT_DATE,
  policy_number text,
  
  -- Customer
  customer_name text not null,
  customer_firstname text,
  
  -- Contract
  category text not null, -- 'life', 'property', 'health', 'legal', 'car'
  sub_category text, -- e.g. 'private_liability', 'pension'
  start_date date,
  payment_method text, -- 'monthly', 'quarterly', 'half_yearly', 'yearly', 'one_time'
  duration integer default 1, -- years
  
  -- Premiums
  net_premium numeric, -- Single payment amount (e.g. monthly net)
  net_premium_yearly numeric,
  gross_premium numeric,
  gross_premium_yearly numeric,
  
  -- Commission Calculation
  commission_rate numeric, -- Percentage (e.g. 7.5) or Promille (e.g. 8.0)
  valuation_sum numeric, -- AP-Summe / Bewertungssumme
  commission_amount numeric, -- Calculated Commission
  
  -- Status
  status text default 'submitted' check (status in ('submitted', 'policed', 'cancelled')),
  policing_date date,
  notes text
);

-- RLS policies
alter table public.production_entries enable row level security;

create policy "Production entries are viewable by everyone" on public.production_entries
  for select using (true);

create policy "Users can insert their own entries" on public.production_entries
  for insert with check (auth.uid() = user_id);

create policy "Users can update their own entries" on public.production_entries
  for update using (auth.uid() = user_id);

create policy "Users can delete their own entries" on public.production_entries
  for delete using (auth.uid() = user_id);
