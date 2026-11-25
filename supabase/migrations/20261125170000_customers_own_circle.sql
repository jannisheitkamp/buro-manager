-- Kunden sieht nur, wer sie betreut: eigene Kunden, als Azubi die des Chefs,
-- als Chef die der eigenen Azubis. Admins sehen alles.
-- Sehen und Bearbeiten folgen derselben Regel (can_edit_customer).

-- Ich, mein Chef (wenn ich Azubi bin) und meine Azubis
create or replace function public.my_circle()
returns uuid[] language sql stable security definer set search_path = public as $$
  select array_remove(
    array[auth.uid(), (select case when p.is_vocational_student then p.boss_id end from public.profiles p where p.id = auth.uid())]
    || coalesce((select array_agg(a.id) from public.profiles a where a.is_vocational_student and a.boss_id = auth.uid()), '{}'),
    null);
$$;
revoke execute on function public.my_circle() from anon, public;
grant execute on function public.my_circle() to authenticated;

create or replace function public.can_edit_customer(p_customer uuid)
returns boolean language sql stable security definer set search_path = public as $$
  with me as (select public.my_circle() as ids)
  select public.is_admin() or (
    public.is_approved_user() and exists (
      select 1 from me where
        exists (select 1 from public.customers c where c.id = p_customer and c.created_by = any (me.ids))
        or exists (
          select 1 from public.production_entries e
          where e.customer_id = p_customer and (e.user_id = any (me.ids) or e.managed_by = any (me.ids))
        )
        or exists (select 1 from public.customer_contracts x where x.customer_id = p_customer and x.created_by = any (me.ids))
    )
  );
$$;

drop policy if exists "customers select" on public.customers;
create policy "customers select" on public.customers for select to authenticated
  using (public.can_edit_customer(id));

drop policy if exists "customer_contracts select" on public.customer_contracts;
create policy "customer_contracts select" on public.customer_contracts for select to authenticated
  using (public.can_edit_customer(customer_id));
