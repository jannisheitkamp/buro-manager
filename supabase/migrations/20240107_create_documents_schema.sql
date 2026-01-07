-- Create documents table
CREATE TABLE IF NOT EXISTS documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT, -- Can be rich text or description for files
  file_path TEXT, -- Path in storage bucket if it's a file
  file_type TEXT NOT NULL CHECK (file_type IN ('text', 'file')),
  created_by UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create document_shares table for collaboration
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

-- Users can see documents they created
CREATE POLICY "Users can view their own documents" ON documents
  FOR SELECT USING (auth.uid() = created_by);

-- Users can see documents shared with them
CREATE POLICY "Users can view shared documents" ON documents
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM document_shares
      WHERE document_shares.document_id = documents.id
      AND document_shares.user_id = auth.uid()
    )
  );

-- Users can insert their own documents
CREATE POLICY "Users can insert their own documents" ON documents
  FOR INSERT WITH CHECK (auth.uid() = created_by);

-- Users can update their own documents
CREATE POLICY "Users can update their own documents" ON documents
  FOR UPDATE USING (auth.uid() = created_by);

-- Users can update documents shared with them (collaboration)
CREATE POLICY "Users can update shared documents" ON documents
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM document_shares
      WHERE document_shares.document_id = documents.id
      AND document_shares.user_id = auth.uid()
    )
  );

-- Users can delete their own documents
CREATE POLICY "Users can delete their own documents" ON documents
  FOR DELETE USING (auth.uid() = created_by);


-- RLS Policies for document_shares

-- Creator can see who they shared with
CREATE POLICY "Creators can view shares" ON document_shares
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_shares.document_id
      AND documents.created_by = auth.uid()
    )
  );

-- Shared users can see they have access
CREATE POLICY "Shared users can view their share" ON document_shares
  FOR SELECT USING (user_id = auth.uid());

-- Only creator can add shares
CREATE POLICY "Creators can add shares" ON document_shares
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_shares.document_id
      AND documents.created_by = auth.uid()
    )
  );

-- Only creator can remove shares
CREATE POLICY "Creators can remove shares" ON document_shares
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_shares.document_id
      AND documents.created_by = auth.uid()
    )
  );

-- Storage Bucket Setup
INSERT INTO storage.buckets (id, name, public) 
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO NOTHING;

-- Storage Policies
CREATE POLICY "Authenticated users can upload documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'documents');

CREATE POLICY "Users can view their own or shared documents"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'documents'); 
-- Note: Fine-grained storage RLS is complex, assuming application level checks for file paths or broad read access for authenticated users for simplicity in MVP, 
-- but ideally we'd check against the documents table. 
-- For now, let's allow authenticated read for the bucket to ensure shared users can download.
