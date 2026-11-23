-- Kundendaten nur für freigeschaltete Teammitglieder (nicht für frisch registrierte Accounts)
create or replace function public.is_approved_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_approved is true);
$$;
revoke execute on function public.is_approved_user() from anon, public;
grant execute on function public.is_approved_user() to authenticated;

drop policy if exists "customers select" on public.customers;
drop policy if exists "customers insert" on public.customers;
drop policy if exists "customers update" on public.customers;
drop policy if exists "customers delete" on public.customers;
create policy "customers select" on public.customers for select to authenticated using (public.is_approved_user());
create policy "customers insert" on public.customers for insert to authenticated with check (public.is_approved_user() and created_by = auth.uid());
-- Ändern (inkl. Umbenennen, das in die Verträge durchschlägt): Admins, wer den Kunden angelegt hat,
-- oder wer einen Vertrag des Kunden hat bzw. betreut
create or replace function public.can_edit_customer(p_customer uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or (
    public.is_approved_user() and (
      exists (select 1 from public.customers c where c.id = p_customer and c.created_by = auth.uid())
      or exists (select 1 from public.production_entries e where e.customer_id = p_customer and (e.user_id = auth.uid() or e.managed_by = auth.uid()))
    )
  );
$$;
revoke execute on function public.can_edit_customer(uuid) from anon, public;
grant execute on function public.can_edit_customer(uuid) to authenticated;
create policy "customers update" on public.customers for update to authenticated using (public.can_edit_customer(id)) with check (public.can_edit_customer(id));
create policy "customers delete" on public.customers for delete to authenticated
  using (public.is_approved_user() and (created_by = auth.uid() or public.is_admin()));
