-- Enable realtime for remaining tables
alter publication supabase_realtime add table bookings;
alter publication supabase_realtime add table absences;
alter publication supabase_realtime add table posts;
