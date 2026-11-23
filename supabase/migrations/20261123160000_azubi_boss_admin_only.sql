-- Azubi-Status und Chef legt nur ein Admin fest (im Verzeichnis)
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
      new.is_vocational_student := false;
    else
      new.roles := old.roles;
      new.is_approved := old.is_approved;
      new.total_vacation_days := old.total_vacation_days;
      new.supervisor_ids := old.supervisor_ids;
      new.boss_id := old.boss_id;
      new.is_vocational_student := old.is_vocational_student;
    end if;
  end if;
  return new;
end;
$function$;
