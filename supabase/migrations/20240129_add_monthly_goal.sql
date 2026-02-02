
-- Add monthly_goal to profiles for sales targets
ALTER TABLE profiles ADD COLUMN monthly_goal numeric DEFAULT 0;
