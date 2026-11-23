-- Azubis wählen in den Einstellungen ihren Chef und dürfen dessen Kunden bearbeiten.
-- Nur für Kundenrechte; Abwesenheiten genehmigen weiterhin die Vorgesetzten, die der Admin festlegt.
-- Bewusst ohne Fremdschlüssel (ein zweiter Bezug auf profiles bricht profiles(...)-Embeds).
alter table public.profiles add column if not exists boss_id uuid;
alter table public.profiles drop constraint if exists profiles_boss_not_self;
alter table public.profiles add constraint profiles_boss_not_self check (boss_id is null or boss_id <> id);
grant select (boss_id) on public.profiles to authenticated;

create or replace function public.protect_profile_privileges()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  -- auth.uid() ist leer bei Service-Role und beim Signup-Trigger
  if auth.uid() is not null and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.roles := '{employee}';
      new.is_approved := false;
      new.total_vacation_days := 30;
      new.supervisor_ids := '{}';
      new.boss_id := null;
    else
      new.roles := old.roles;
      new.is_approved := old.is_approved;
      new.total_vacation_days := old.total_vacation_days;
      new.supervisor_ids := old.supervisor_ids;
      -- Chef wählen nur Azubis, und nur für sich selbst
      if not coalesce(new.is_vocational_student, false) then
        new.boss_id := null;
      elsif new.id <> auth.uid() then
        new.boss_id := old.boss_id;
      end if;
    end if;
  end if;
  return new;
end;
$function$;

create or replace function public.can_edit_customer(p_customer uuid)
returns boolean language sql stable security definer set search_path = public as $$
  with me as (
    select p.id, case when p.is_vocational_student then p.boss_id end as boss
    from public.profiles p where p.id = auth.uid()
  )
  select public.is_admin() or (
    public.is_approved_user() and exists (
      select 1 from me where
        exists (select 1 from public.customers c where c.id = p_customer and c.created_by in (me.id, me.boss))
        or exists (
          select 1 from public.production_entries e
          where e.customer_id = p_customer and (e.user_id in (me.id, me.boss) or e.managed_by in (me.id, me.boss))
        )
    )
  );
$$;
