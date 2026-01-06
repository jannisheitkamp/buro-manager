create table if not exists public.user_commission_settings (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  category text not null, -- 'life', 'health', 'property', etc.
  sub_category text, -- 'Leben', 'BU', 'PHV', 'KV Voll', etc.
  rate_value numeric not null, -- 8.0, 3.0, 7.5 etc.
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, category, sub_category)
);

alter table public.user_commission_settings enable row level security;

create policy "Users can view own settings" on public.user_commission_settings
  for select using (auth.uid() = user_id);

create policy "Users can insert own settings" on public.user_commission_settings
  for insert with check (auth.uid() = user_id);

create policy "Users can update own settings" on public.user_commission_settings
  for update using (auth.uid() = user_id);
