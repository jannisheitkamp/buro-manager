
-- Drop existing select policy if it conflicts, or just ensure admins can view all profiles
drop policy if exists "Public profiles are viewable by everyone" on public.profiles;
drop policy if exists "Users can view own profile" on public.profiles;

-- Create a policy that allows everyone to view profiles (needed for directory to work for employees too)
-- OR restrict it: Employees see approved colleagues, Admins see everyone.

create policy "Profiles are viewable by authenticated users" on public.profiles
  for select using (auth.role() = 'authenticated');

-- Ensure admins can update profiles (to approve them)
create policy "Admins can update any profile" on public.profiles
  for update using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and roles @> '{"admin"}'::text[]
    )
  );

-- Fix for is_approved default: set nulls to false
update public.profiles set is_approved = false where is_approved is null;

