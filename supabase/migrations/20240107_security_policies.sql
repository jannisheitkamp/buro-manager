-- 1. Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_commission_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE callbacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE parcels ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_votes ENABLE ROW LEVEL SECURITY;

-- 2. Policies for 'profiles'
-- View: Everyone can view basic profile info (needed for Directory)
CREATE POLICY "Public profiles are viewable by everyone" 
ON profiles FOR SELECT USING (true);

-- Update: Users can update their own profile
CREATE POLICY "Users can update own profile" 
ON profiles FOR UPDATE USING (auth.uid() = id);

-- 3. Policies for 'user_status'
-- View: Everyone can see status (Team Dashboard)
CREATE POLICY "Status viewable by everyone" 
ON user_status FOR SELECT USING (true);

-- Insert/Update: Users can only set their own status
CREATE POLICY "Users can insert own status" 
ON user_status FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own status" 
ON user_status FOR UPDATE USING (auth.uid() = user_id);

-- 4. Policies for 'user_commission_settings' (SENSITIVE!)
-- View: Users can only see their OWN settings
CREATE POLICY "Users view own commission settings" 
ON user_commission_settings FOR SELECT USING (auth.uid() = user_id);

-- Insert/Update/Delete: Users manage their own
CREATE POLICY "Users manage own commission settings" 
ON user_commission_settings FOR ALL USING (auth.uid() = user_id);

-- 5. Policies for 'calendar_events' (Shared Team Calendar)
-- View/Edit: Trusted environment - everyone can read/write events
-- (Alternatively, restrict delete to creator if desired)
CREATE POLICY "Team calendar access" 
ON calendar_events FOR ALL USING (true);

-- 6. Policies for 'callbacks' (Shared Task List)
-- Everyone can read/write callbacks (Assigning tasks to others)
CREATE POLICY "Team callbacks access" 
ON callbacks FOR ALL USING (true);

-- 7. Policies for 'parcels'
-- View: Everyone can see parcel list
CREATE POLICY "Team parcels access" 
ON parcels FOR ALL USING (true);

-- 8. Policies for 'production_entries'
-- View: Users see their own + Admins see all (Logic handled in app, but strictly DB wise:)
-- For now, allow team to see stats (Dashboard Leaderboard) or restrict?
-- Let's restrict editing to creator.
CREATE POLICY "View production" 
ON production_entries FOR SELECT USING (true);

CREATE POLICY "Create production" 
ON production_entries FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 9. Policies for 'board_messages'
CREATE POLICY "Read board" 
ON board_messages FOR SELECT USING (true);

CREATE POLICY "Post to board" 
ON board_messages FOR INSERT WITH CHECK (auth.uid() = user_id);

