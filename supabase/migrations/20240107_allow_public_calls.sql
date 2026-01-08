-- Allow anonymous users (public) to insert calls
-- This ensures that even if the browser session is expired or the link opens in a fresh container, the call is still logged.

DROP POLICY IF EXISTS "Phone calls insertable by authenticated users" ON phone_calls;

CREATE POLICY "Phone calls insertable by everyone" 
ON phone_calls FOR INSERT 
TO public 
WITH CHECK (true);
