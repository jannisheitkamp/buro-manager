-- Ensure RLS is enabled for critical tables
ALTER TABLE IF EXISTS public.production_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.absences ENABLE ROW LEVEL SECURITY;

-- If they don't have policies, this will lock them down by default (which is good).
-- We assume policies already exist from previous migrations, but we ensure the tables are protected.

-- Example: Secure documents so only the owner or assigned user can view
-- Drop existing open policy if any (optional, assuming we don't want to break existing but want to show the audit)
-- We will just make sure RLS is enabled.
