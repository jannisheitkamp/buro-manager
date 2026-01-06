
alter table public.calendar_events enable row level security;

create policy "Enable read access for authenticated users"
on public.calendar_events for select
to authenticated
using (true);

create policy "Enable insert access for authenticated users"
on public.calendar_events for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Enable update access for users based on user_id"
on public.calendar_events for update
to authenticated
using (auth.uid() = user_id);

create policy "Enable delete access for users based on user_id"
on public.calendar_events for delete
to authenticated
using (auth.uid() = user_id);

