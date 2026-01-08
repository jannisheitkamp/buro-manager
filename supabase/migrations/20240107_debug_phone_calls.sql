-- Temporarily allow everyone to view ALL calls to debug
DROP POLICY IF EXISTS "Users can view own calls" ON phone_calls;

CREATE POLICY "Users can view all calls" 
ON phone_calls FOR SELECT 
TO authenticated 
USING (true);
