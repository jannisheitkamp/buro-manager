-- Secure phone_calls table
-- 1. Remove public permissions (except INSERT, which we need for the webhook flow to be robust)
REVOKE SELECT, UPDATE, DELETE ON phone_calls FROM public;

-- 2. Drop debug/insecure policies
DROP POLICY IF EXISTS "Public Select" ON phone_calls;
DROP POLICY IF EXISTS "Users can view all calls" ON phone_calls;
DROP POLICY IF EXISTS "Phone calls viewable by authenticated users" ON phone_calls;

-- 3. Create secure policies
-- View: Own calls OR Admin
CREATE POLICY "Users can view own calls" 
ON phone_calls FOR SELECT 
TO authenticated 
USING (
    user_id = auth.uid() 
    OR 
    (auth.uid() IN (SELECT id FROM profiles WHERE 'admin' = ANY(roles)))
);

-- Update: Own calls OR Admin
DROP POLICY IF EXISTS "Users can update own calls" ON phone_calls;
CREATE POLICY "Users can update own calls" 
ON phone_calls FOR UPDATE 
TO authenticated 
USING (
    user_id = auth.uid() 
    OR 
    (auth.uid() IN (SELECT id FROM profiles WHERE 'admin' = ANY(roles)))
);

-- Delete: Own calls OR Admin
DROP POLICY IF EXISTS "Users can delete own calls" ON phone_calls;
DROP POLICY IF EXISTS "Users can delete calls" ON phone_calls;

CREATE POLICY "Users can delete own calls" 
ON phone_calls FOR DELETE 
TO authenticated 
USING (
    user_id = auth.uid() 
    OR 
    (auth.uid() IN (SELECT id FROM profiles WHERE 'admin' = ANY(roles)))
);
