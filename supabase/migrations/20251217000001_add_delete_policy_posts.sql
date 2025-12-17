-- Add DELETE policy for posts
CREATE POLICY "Users can delete own posts or admin can delete any" 
ON public.posts FOR DELETE 
TO authenticated 
USING (
  auth.uid() = user_id 
  OR 
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND role = 'admin'
  )
);
