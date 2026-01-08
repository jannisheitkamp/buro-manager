-- Ensure profiles are viewable by authenticated users so dropdowns work
CREATE POLICY "Profiles are viewable by everyone" 
ON profiles FOR SELECT 
TO authenticated 
USING (true);

-- If policy already exists, this might fail, so we can drop first or just use DO block.
-- But standard way in this env is usually just trying to create or using "IF NOT EXISTS" logic if supported, 
-- but Postgres CREATE POLICY doesn't support IF NOT EXISTS natively in all versions.
-- We can drop it first to be safe.

DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

CREATE POLICY "Profiles are viewable by everyone" 
ON profiles FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Users can insert their own profile" 
ON profiles FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile" 
ON profiles FOR UPDATE 
TO authenticated 
USING (auth.uid() = id);
