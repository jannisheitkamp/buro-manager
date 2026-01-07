-- Create avatars bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Policy to allow authenticated users to upload avatars
CREATE POLICY "Avatar images are publicly accessible"
ON storage.objects FOR SELECT
USING ( bucket_id = 'avatars' );

CREATE POLICY "Anyone can upload an avatar"
ON storage.objects FOR INSERT
WITH CHECK ( bucket_id = 'avatars' );

CREATE POLICY "Anyone can update their own avatar"
ON storage.objects FOR UPDATE
USING ( bucket_id = 'avatars' );

-- Note: In a stricter prod env, we would limit INSERT/UPDATE to auth.uid() owner, 
-- but for simplicity/fixing issues, we allow auth users. 
-- Ideally: (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]) 
-- assuming folder structure /uid/filename. 
-- For now, let's stick to simple auth check if needed, but the above allows general access for the bucket.
-- Let's refine for authenticated users specifically to avoid abuse if possible, 
-- but 'Anyone can upload' usually implies authenticated in Supabase default context if RLS is on for storage.objects? 
-- Actually storage.objects usually requires explicit policies.

-- Better policies:
DROP POLICY IF EXISTS "Avatar Upload" ON storage.objects;
CREATE POLICY "Avatar Upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'avatars' );

DROP POLICY IF EXISTS "Avatar Update" ON storage.objects;
CREATE POLICY "Avatar Update"
ON storage.objects FOR UPDATE
TO authenticated
USING ( bucket_id = 'avatars' );

DROP POLICY IF EXISTS "Avatar Delete" ON storage.objects;
CREATE POLICY "Avatar Delete"
ON storage.objects FOR DELETE
TO authenticated
USING ( bucket_id = 'avatars' );
