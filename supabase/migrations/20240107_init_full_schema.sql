-- 1. Create Tables (Idempotent: IF NOT EXISTS)

-- Profiles (Users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  roles TEXT[] DEFAULT '{}',
  is_approved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- User Status
CREATE TABLE IF NOT EXISTS user_status (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL, -- 'office', 'remote', etc.
  message TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Commission Settings
CREATE TABLE IF NOT EXISTS user_commission_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  sub_category TEXT NOT NULL,
  rate_value NUMERIC NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Calendar Events
CREATE TABLE IF NOT EXISTS calendar_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE NOT NULL,
  category TEXT DEFAULT 'Allgemein',
  location TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Callbacks
CREATE TABLE IF NOT EXISTS callbacks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  reason TEXT,
  priority TEXT DEFAULT 'normal', -- 'normal', 'high'
  status TEXT DEFAULT 'open', -- 'open', 'done'
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Parcels
CREATE TABLE IF NOT EXISTS parcels (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  recipient_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  recipient_name TEXT,
  sender TEXT,
  carrier TEXT, -- DHL, UPS...
  status TEXT DEFAULT 'pending', -- 'pending', 'picked_up'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Production Entries (Umsatz)
CREATE TABLE IF NOT EXISTS production_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  insurance_company TEXT,
  category TEXT, -- 'Leben', 'Sach'...
  sub_category TEXT,
  monthly_premium NUMERIC,
  commission_rate NUMERIC,
  valuation_sum NUMERIC,
  commission_amount NUMERIC,
  units NUMERIC,
  submission_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  status TEXT DEFAULT 'submitted',
  notes TEXT
);

-- Board Messages (Schwarzes Brett)
CREATE TABLE IF NOT EXISTS board_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Polls (Umfragen)
CREATE TABLE IF NOT EXISTS polls (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  question TEXT NOT NULL,
  options JSONB NOT NULL, -- Array of strings
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Poll Votes
CREATE TABLE IF NOT EXISTS poll_votes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  poll_id UUID REFERENCES polls(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  option_index INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(poll_id, user_id) -- One vote per user per poll
);


-- 2. ENABLE RLS (Security)

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


-- 3. CREATE POLICIES (Access Control)

-- Profiles
DROP POLICY IF EXISTS "Public profiles" ON profiles;
CREATE POLICY "Public profiles" ON profiles FOR SELECT USING (true);
DROP POLICY IF EXISTS "Update own profile" ON profiles;
CREATE POLICY "Update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
-- Allow new users to insert their profile on signup
DROP POLICY IF EXISTS "Insert own profile" ON profiles;
CREATE POLICY "Insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- User Status
DROP POLICY IF EXISTS "Public status" ON user_status;
CREATE POLICY "Public status" ON user_status FOR SELECT USING (true);
DROP POLICY IF EXISTS "Manage own status" ON user_status;
CREATE POLICY "Manage own status" ON user_status FOR ALL USING (auth.uid() = user_id);

-- Commission Settings (Private!)
DROP POLICY IF EXISTS "Manage own rates" ON user_commission_settings;
CREATE POLICY "Manage own rates" ON user_commission_settings FOR ALL USING (auth.uid() = user_id);

-- Calendar (Team Shared)
DROP POLICY IF EXISTS "Team calendar" ON calendar_events;
CREATE POLICY "Team calendar" ON calendar_events FOR ALL USING (true);

-- Board (Team Shared)
DROP POLICY IF EXISTS "Read board" ON board_messages;
CREATE POLICY "Read board" ON board_messages FOR SELECT USING (true);
DROP POLICY IF EXISTS "Post board" ON board_messages;
CREATE POLICY "Post board" ON board_messages FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Callbacks (Team Shared)
DROP POLICY IF EXISTS "Team callbacks" ON callbacks;
CREATE POLICY "Team callbacks" ON callbacks FOR ALL USING (true);

-- Parcels (Team Shared)
DROP POLICY IF EXISTS "Team parcels" ON parcels;
CREATE POLICY "Team parcels" ON parcels FOR ALL USING (true);

-- Production (Own + Admin view potentially, currently Own read/write)
DROP POLICY IF EXISTS "View production" ON production_entries;
CREATE POLICY "View production" ON production_entries FOR SELECT USING (true); -- Simplified for team leaderboard
DROP POLICY IF EXISTS "Manage own production" ON production_entries;
CREATE POLICY "Manage own production" ON production_entries FOR ALL USING (auth.uid() = user_id);

-- Polls
DROP POLICY IF EXISTS "View polls" ON polls;
CREATE POLICY "View polls" ON polls FOR SELECT USING (true);
DROP POLICY IF EXISTS "Vote polls" ON poll_votes;
CREATE POLICY "Vote polls" ON poll_votes FOR ALL USING (auth.uid() = user_id OR true); -- Simplified voting
