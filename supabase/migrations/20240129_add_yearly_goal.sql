
-- Add yearly_goal to profiles if it doesn't exist
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS yearly_goal numeric DEFAULT 0;
