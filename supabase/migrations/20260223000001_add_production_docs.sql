-- Migration to add documents to production entries

-- 1. Add document_url column to production_entries
ALTER TABLE public.production_entries 
ADD COLUMN IF NOT EXISTS document_url TEXT;

-- 2. Create production_docs bucket in storage
INSERT INTO storage.buckets (id, name, public)
VALUES ('production_docs', 'production_docs', false) -- Private bucket for security
ON CONFLICT (id) DO NOTHING;

-- 3. Storage Policies for production_docs
-- Allow authenticated users to upload documents
CREATE POLICY "Allow authenticated to upload production docs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'production_docs' );

-- Allow users to view their own documents or admins to view all
CREATE POLICY "Allow users to view their own production docs"
ON storage.objects FOR SELECT
TO authenticated
USING ( 
    bucket_id = 'production_docs' 
    AND (
        (auth.uid())::text = (storage.foldername(name))[1] -- Folder structure /uid/filename
        OR 
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND 'admin' = ANY(roles)
        )
    )
);

-- Allow users to delete their own documents
CREATE POLICY "Allow users to delete their own production docs"
ON storage.objects FOR DELETE
TO authenticated
USING ( 
    bucket_id = 'production_docs' 
    AND (auth.uid())::text = (storage.foldername(name))[1]
);
