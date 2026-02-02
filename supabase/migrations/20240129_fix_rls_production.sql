
-- Enable RLS on production_entries if not already enabled
ALTER TABLE production_entries ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can view their own production entries" ON production_entries;
DROP POLICY IF EXISTS "Admins can view all production entries" ON production_entries;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON production_entries;

-- Policy 1: Admins can see EVERYTHING
CREATE POLICY "Admins can view all production entries" 
ON production_entries FOR SELECT 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.roles @> ARRAY['admin']
  )
);

-- Policy 2: Users can see entries where they are the 'user_id' OR 'managed_by'
CREATE POLICY "Users can view their own production entries" 
ON production_entries FOR SELECT 
TO authenticated 
USING (
  auth.uid() = user_id OR auth.uid() = managed_by
);

-- Policy 3: Allow INSERT for authenticated users (so they can create entries)
CREATE POLICY "Users can insert production entries" 
ON production_entries FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = user_id);

-- Policy 4: Allow UPDATE for own entries
CREATE POLICY "Users can update own production entries" 
ON production_entries FOR UPDATE
TO authenticated 
USING (auth.uid() = user_id OR auth.uid() = managed_by);
