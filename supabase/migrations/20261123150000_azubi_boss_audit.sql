-- Chef muss ein freigeschaltetes Teammitglied sein; Änderungen an Chef, Vorgesetzten und Azubi-Status protokollieren
create or replace function public.trg_check_boss()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.boss_id is not null and new.boss_id is distinct from old.boss_id
     and not exists (select 1 from public.profiles p where p.id = new.boss_id and p.is_approved is true) then
    raise exception 'Als Chef geht nur ein freigeschaltetes Teammitglied';
  end if;
  return new;
end $$;

drop trigger if exists check_boss on public.profiles;
create trigger check_boss before update of boss_id on public.profiles
  for each row execute function public.trg_check_boss();

drop trigger if exists audit_profiles on public.profiles;
create trigger audit_profiles after delete or update on public.profiles
  for each row execute function trg_audit('full_name', 'roles', 'is_approved', 'total_vacation_days', 'supervisor_ids', 'boss_id', 'is_vocational_student');
