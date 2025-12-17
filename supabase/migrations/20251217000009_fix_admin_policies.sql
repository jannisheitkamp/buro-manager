-- Fix permissions for Admins to update other users' data

-- 1. Allow Admins to update any profile (e.g. for changing roles)
CREATE POLICY "Admins can update any profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND 'admin' = ANY(roles)
  )
);

-- 2. Allow Admins to update any absence (e.g. for approvals)
CREATE POLICY "Admins can update any absence"
ON public.absences FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND 'admin' = ANY(roles)
  )
);
