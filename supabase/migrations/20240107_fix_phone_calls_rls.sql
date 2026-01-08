-- Fix RLS policy for phone_calls to allow inserts from authenticated users (or anon if needed for webhook)
-- Currently it says "Phone calls insertable by service role only" which blocks the client-side insert we do in IncomingCallHandler.

DROP POLICY IF EXISTS "Phone calls insertable by service role only" ON phone_calls;

-- Allow authenticated users (like the one logged in when the popup opens) to insert calls
CREATE POLICY "Phone calls insertable by authenticated users" 
ON phone_calls FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- Allow anonymous users to insert calls (in case the webhook page is opened without being logged in - unlikely for your use case but safer for the webhook concept)
-- Actually, for now let's stick to authenticated since you are logged in.

-- Ensure SELECT policy is correct
DROP POLICY IF EXISTS "Phone calls viewable by authenticated users" ON phone_calls;
CREATE POLICY "Phone calls viewable by authenticated users" 
ON phone_calls FOR SELECT 
TO authenticated 
USING (true);
