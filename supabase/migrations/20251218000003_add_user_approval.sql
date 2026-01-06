alter table public.profiles add column if not exists is_approved boolean default false;

-- Auto-approve the first user (you) or specific emails if needed, otherwise everyone starts as false.
-- For now, we assume manual approval.

create policy "Admins can approve users" on public.profiles
  for update using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and 'admin' = any(roles)
    )
  );
