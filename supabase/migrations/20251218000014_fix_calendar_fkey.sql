
alter table public.calendar_events 
add constraint calendar_events_user_id_fkey 
foreign key (user_id) 
references public.profiles (id) 
on delete cascade;

