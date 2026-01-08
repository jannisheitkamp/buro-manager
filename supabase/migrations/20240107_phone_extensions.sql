-- Add phone_extension to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone_extension TEXT;

-- Add user_id to phone_calls for RLS ownership
ALTER TABLE phone_calls ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES profiles(id);

-- Update RLS for phone_calls to be user-specific
DROP POLICY IF EXISTS "Phone calls viewable by authenticated users" ON phone_calls;

CREATE POLICY "Users can view own calls" 
ON phone_calls FOR SELECT 
TO authenticated 
USING (
    user_id = auth.uid() 
    OR 
    -- Fallback: If no user_id is assigned (e.g. old calls), maybe show to admins or everyone?
    -- For now, strict: only own calls.
    (user_id IS NULL AND auth.uid() IN (SELECT id FROM profiles WHERE 'admin' = ANY(roles)))
);

-- Update Update Policy
DROP POLICY IF EXISTS "Phone calls updatable by authenticated users" ON phone_calls;

CREATE POLICY "Users can update own calls" 
ON phone_calls FOR UPDATE 
TO authenticated 
USING (user_id = auth.uid());
