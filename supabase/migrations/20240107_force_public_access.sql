-- Enable realtime for phone_calls
ALTER PUBLICATION supabase_realtime ADD TABLE phone_calls;

-- Ensure public role has INSERT permissions
GRANT INSERT ON phone_calls TO public;
GRANT SELECT ON phone_calls TO public;
GRANT UPDATE ON phone_calls TO public;

-- Drop all restrictive policies and make it wide open for testing
DROP POLICY IF EXISTS "Phone calls insertable by everyone" ON phone_calls;
DROP POLICY IF EXISTS "Phone calls insertable by authenticated users" ON phone_calls;
DROP POLICY IF EXISTS "Phone calls insertable by service role only" ON phone_calls;

CREATE POLICY "Public Insert" 
ON phone_calls FOR INSERT 
TO public 
WITH CHECK (true);

CREATE POLICY "Public Select" 
ON phone_calls FOR SELECT 
TO public 
USING (true);
