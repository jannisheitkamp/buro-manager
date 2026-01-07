-- DROP EVERYTHING FIRST to clear the slate
DROP POLICY IF EXISTS "Global Privacy Shield" ON public.production_entries;
DROP POLICY IF EXISTS "Basic Owner Access" ON public.production_entries;
DROP POLICY IF EXISTS "Strict View Own" ON public.production_entries;
DROP POLICY IF EXISTS "Strict Insert Own" ON public.production_entries;
DROP POLICY IF EXISTS "Strict Update Own" ON public.production_entries;
DROP POLICY IF EXISTS "Strict Delete Own" ON public.production_entries;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.production_entries;
DROP POLICY IF EXISTS "Enable insert for users based on user_id" ON public.production_entries;
DROP POLICY IF EXISTS "Allow all authenticated to view" ON public.production_entries;
DROP POLICY IF EXISTS "Allow users to insert own" ON public.production_entries;
DROP POLICY IF EXISTS "Allow users to update own" ON public.production_entries;
DROP POLICY IF EXISTS "Allow users to delete own" ON public.production_entries;

-- Make sure RLS is enabled
ALTER TABLE public.production_entries ENABLE ROW LEVEL SECURITY;

-- 1. READ: OPEN TO ALL AUTHENTICATED USERS (for Leaderboard to work)
-- We remove the restriction that users can only see their own data, so they can see the leaderboard.
CREATE POLICY "View All Entries" ON public.production_entries
    FOR SELECT
    TO authenticated
    USING (true);

-- 2. INSERT: Allow users to insert rows where user_id matches their own ID
CREATE POLICY "Insert Own Entries" ON public.production_entries
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- 3. UPDATE: Allow users to update their own rows
CREATE POLICY "Update Own Entries" ON public.production_entries
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id OR (SELECT 'admin' = ANY(roles) FROM public.profiles WHERE id = auth.uid()));

-- 4. DELETE: Allow users to delete their own rows
CREATE POLICY "Delete Own Entries" ON public.production_entries
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id OR (SELECT 'admin' = ANY(roles) FROM public.profiles WHERE id = auth.uid()));
