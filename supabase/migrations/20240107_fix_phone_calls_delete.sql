-- Fix delete policy for phone_calls
-- Currently the policy "Users can update own calls" might not cover DELETE operations, or there is no DELETE policy at all.

DROP POLICY IF EXISTS "Users can delete own calls" ON phone_calls;

CREATE POLICY "Users can delete own calls" 
ON phone_calls FOR DELETE 
TO authenticated 
USING (user_id = auth.uid());
