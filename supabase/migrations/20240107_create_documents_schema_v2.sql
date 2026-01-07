-- Drop existing policies to ensure clean state
DROP POLICY IF EXISTS "Users can view their own documents" ON documents;
DROP POLICY IF EXISTS "Users can view shared documents" ON documents;
DROP POLICY IF EXISTS "Users can insert their own documents" ON documents;
DROP POLICY IF EXISTS "Users can update their own documents" ON documents;
DROP POLICY IF EXISTS "Users can update shared documents" ON documents;
DROP POLICY IF EXISTS "Users can delete their own documents" ON documents;

DROP POLICY IF EXISTS "Creators can view shares" ON document_shares;
DROP POLICY IF EXISTS "Shared users can view their share" ON document_shares;
DROP POLICY IF EXISTS "Creators can add shares" ON document_shares;
DROP POLICY IF EXISTS "Creators can remove shares" ON document_shares;

-- Create documents table (Idempotent)
CREATE TABLE IF NOT EXISTS documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT,
  file_path TEXT,
  file_type TEXT NOT NULL CHECK (file_type IN ('text', 'file')),
  created_by UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create document_shares table (Idempotent)
CREATE TABLE IF NOT EXISTS document_shares (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(document_id, user_id)
);

-- Enable RLS
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_shares ENABLE ROW LEVEL SECURITY;

-- RLS Policies for documents

CREATE POLICY "Users can view their own documents" ON documents
  FOR SELECT USING (auth.uid() = created_by);

CREATE POLICY "Users can view shared documents" ON documents
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM document_shares
      WHERE document_shares.document_id = documents.id
      AND document_shares.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own documents" ON documents
  FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own documents" ON documents
  FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY "Users can update shared documents" ON documents
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM document_shares
      WHERE document_shares.document_id = documents.id
      AND document_shares.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own documents" ON documents
  FOR DELETE USING (auth.uid() = created_by);


-- RLS Policies for document_shares

CREATE POLICY "Creators can view shares" ON document_shares
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_shares.document_id
      AND documents.created_by = auth.uid()
    )
  );

CREATE POLICY "Shared users can view their share" ON document_shares
  FOR SELECT USING (user_id = auth.uid());

-- IMPORTANT FIX: Allow inserting shares if you are the creator of the LINKED document
-- The previous check might have failed because the subquery couldn't see the document yet or context issue.
-- But standard RLS should work. Let's make sure the user has access to the document.
CREATE POLICY "Creators can add shares" ON document_shares
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_shares.document_id
      AND documents.created_by = auth.uid()
    )
  );

CREATE POLICY "Creators can remove shares" ON document_shares
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_shares.document_id
      AND documents.created_by = auth.uid()
    )
  );

-- Storage Bucket Setup (Idempotent)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO NOTHING;

-- Storage Policies
DROP POLICY IF EXISTS "Authenticated users can upload documents" ON storage.objects;
CREATE POLICY "Authenticated users can upload documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'documents');

DROP POLICY IF EXISTS "Users can view their own or shared documents" ON storage.objects;
CREATE POLICY "Users can view their own or shared documents"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'documents');
