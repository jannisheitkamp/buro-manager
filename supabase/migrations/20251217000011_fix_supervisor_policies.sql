-- Allow supervisors to update absences of their assigned supervisees

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
      -- Vaupel checks Marcio
      (
        'vaupel' = ANY(supervisor.roles) 
        AND EXISTS (
          SELECT 1 FROM public.profiles AS supervisee 
          WHERE supervisee.id = absences.user_id 
          AND 'marcio' = ANY(supervisee.roles)
        )
      )
    )
  )
);
