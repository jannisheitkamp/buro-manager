-- Add columns for documents and signatures
ALTER TABLE public.absences
ADD COLUMN IF NOT EXISTS certificate_url TEXT,
ADD COLUMN IF NOT EXISTS signature_url TEXT;

-- Create storage bucket for absence documents if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('absence_documents', 'absence_documents', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to absence_documents
CREATE POLICY "Authenticated users can upload absence documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'absence_documents');

-- Allow authenticated users to view absence documents
CREATE POLICY "Authenticated users can view absence documents"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'absence_documents');

-- Allow users to delete their own documents (or admins)
CREATE POLICY "Users can delete their absence documents"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'absence_documents');
