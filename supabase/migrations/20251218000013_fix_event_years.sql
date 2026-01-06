
update public.calendar_events 
set start_time = start_time - interval '1 year',
    end_time = end_time - interval '1 year'
where extract(year from start_time) = 2026;

