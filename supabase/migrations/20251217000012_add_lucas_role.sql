-- Update roles constraint and permissions for Lucas

-- 1. Update the role check constraint to include 'lucas'
-- Note: We use the array containment operator <@ because 'roles' is a text[] column
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_roles_check;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check; -- cleanup old one if it somehow stuck

ALTER TABLE public.profiles 
ADD CONSTRAINT profiles_roles_check 
CHECK (roles <@ ARRAY[
  'admin', 
  'employee', 
  'gruppe_vaupel', 
  'gruppe_kalies', 
  'selbststaendig', 
  'tim', 
  'morris', 
  'vaupel', 
  'jannis', 
  'flori', 
  'marcio',
  'lucas'
]::text[]);

-- 2. Update the supervisor policy to include Lucas for Vaupel
DROP POLICY IF EXISTS "Supervisors can update supervisee absences" ON public.absences;

CREATE POLICY "Supervisors can update supervisee absences"
ON public.absences FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles AS supervisor
    WHERE supervisor.id = auth.uid()
    AND (
      -- Tim checks Jannis
      (
        'tim' = ANY(supervisor.roles) 
        AND EXISTS (
          SELECT 1 FROM public.profiles AS supervisee 
          WHERE supervisee.id = absences.user_id 
          AND 'jannis' = ANY(supervisee.roles)
        )
      )
      OR
      -- Morris checks Flori
      (
        'morris' = ANY(supervisor.roles) 
        AND EXISTS (
          SELECT 1 FROM public.profiles AS supervisee 
          WHERE supervisee.id = absences.user_id 
          AND 'flori' = ANY(supervisee.roles)
        )
      )
      OR
      -- Vaupel checks Marcio AND Lucas
      (
        'vaupel' = ANY(supervisor.roles) 
        AND EXISTS (
          SELECT 1 FROM public.profiles AS supervisee 
          WHERE supervisee.id = absences.user_id 
          AND ('marcio' = ANY(supervisee.roles) OR 'lucas' = ANY(supervisee.roles))
        )
      )
    )
  )
);
