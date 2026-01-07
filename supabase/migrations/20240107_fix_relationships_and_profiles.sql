-- 1. Ensure `production_entries` has a direct Foreign Key to `public.profiles`
-- This is often needed for Supabase client to reliably perform joins like `.select('*, profiles(*)')`
ALTER TABLE public.production_entries
DROP CONSTRAINT IF EXISTS production_entries_user_id_fkey;

ALTER TABLE public.production_entries
ADD CONSTRAINT production_entries_user_id_fkey
FOREIGN KEY (user_id) REFERENCES public.profiles(id)
ON DELETE CASCADE;

-- 2. Ensure Profiles are viewable by everyone (so the Leaderboard can show names)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

CREATE POLICY "Profiles are viewable by authenticated users" ON public.profiles
    FOR SELECT
    TO authenticated
    USING (true);

-- 3. Ensure Profiles can be updated by Admins or Owner
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE
    USING (auth.uid() = id);

CREATE POLICY "Admins can update any profile" ON public.profiles
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND 'admin' = ANY(roles)
        )
    );
