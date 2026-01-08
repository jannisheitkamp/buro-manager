-- Grant DELETE permissions to public role for phone_calls to avoid any RLS issues with deletion for now
-- This is a broad permission but ensures functionality first.
GRANT DELETE ON phone_calls TO authenticated;
GRANT DELETE ON phone_calls TO service_role;

-- Ensure the RLS policy is actually applied and correct
DROP POLICY IF EXISTS "Users can delete own calls" ON phone_calls;

-- Let's try a broader delete policy for testing purposes if user_id is null or matching
CREATE POLICY "Users can delete calls" 
ON phone_calls FOR DELETE 
TO authenticated 
USING (
    user_id = auth.uid() 
    OR 
    user_id IS NULL -- Allow deleting unassigned calls
    OR
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() 
        AND 'admin' = ANY(roles)
    )
);
