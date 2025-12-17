-- 1. Drop the dependent policy
DROP POLICY IF EXISTS "Users can delete own posts or admin can delete any" ON public.posts;

-- 2. Add roles column
ALTER TABLE public.profiles ADD COLUMN roles TEXT[] DEFAULT '{employee}';

-- 3. Migrate existing data
UPDATE public.profiles SET roles = ARRAY[role];

-- 4. Update the trigger function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET SEARCH_PATH = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, roles)
  VALUES (new.id, new.email, new.raw_user_meta_data ->> 'full_name', '{employee}');
  RETURN new;
END;
$$;

-- 5. Drop the old role column
ALTER TABLE public.profiles DROP COLUMN role;

-- 6. Re-create the policy using the new roles column (using ANY operator)
CREATE POLICY "Users can delete own posts or admin can delete any" 
ON public.posts FOR DELETE 
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
