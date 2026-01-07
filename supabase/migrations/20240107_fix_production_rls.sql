-- Drop existing policies to clean up
DROP POLICY IF EXISTS "Global Privacy Shield" ON public.production_entries;
DROP POLICY IF EXISTS "Basic Owner Access" ON public.production_entries;
DROP POLICY IF EXISTS "Strict View Own" ON public.production_entries;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.production_entries;
DROP POLICY IF EXISTS "Enable insert for users based on user_id" ON public.production_entries;

-- Make sure RLS is enabled
ALTER TABLE public.production_entries ENABLE ROW LEVEL SECURITY;

-- 1. READ: Allow all authenticated users to view all entries (needed for Leaderboard)
CREATE POLICY "Allow all authenticated to view" ON public.production_entries
    FOR SELECT
    TO authenticated
    USING (true);

-- 2. INSERT: Allow users to insert their own data
CREATE POLICY "Allow users to insert own" ON public.production_entries
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- 3. UPDATE: Allow users to update their own data OR Admins
CREATE POLICY "Allow users to update own" ON public.production_entries
    FOR UPDATE
    TO authenticated
    USING (
        auth.uid() = user_id 
        OR 
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() 
            AND 'admin' = ANY(roles)
        )
    );

-- 4. DELETE: Allow users to delete their own data OR Admins
CREATE POLICY "Allow users to delete own" ON public.production_entries
    FOR DELETE
    TO authenticated
    USING (
        auth.uid() = user_id 
        OR 
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() 
            AND 'admin' = ANY(roles)
        )
    );
