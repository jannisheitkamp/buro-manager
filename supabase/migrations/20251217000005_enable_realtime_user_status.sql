-- Enable realtime for user_status table
alter publication supabase_realtime add table user_status;

-- Enable realtime for profiles table
alter publication supabase_realtime add table profiles;
