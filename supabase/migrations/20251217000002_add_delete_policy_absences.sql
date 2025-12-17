-- Add DELETE policy for absences
CREATE POLICY "Users can delete own absences" 
ON public.absences FOR DELETE 
TO authenticated 
USING (auth.uid() = user_id);
