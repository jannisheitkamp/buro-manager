-- NUCLEAR OPTION: Drop ALL potential policies to ensure clean slate
DROP POLICY IF EXISTS "Users can view their own documents" ON documents;
DROP POLICY IF EXISTS "Users can view shared documents" ON documents;
DROP POLICY IF EXISTS "Users can insert their own documents" ON documents;
DROP POLICY IF EXISTS "Users can update their own documents" ON documents;
DROP POLICY IF EXISTS "Users can update shared documents" ON documents;
DROP POLICY IF EXISTS "Users can delete their own documents" ON documents;
DROP POLICY IF EXISTS "Access own or shared documents" ON documents;
DROP POLICY IF EXISTS "Insert own documents" ON documents;
DROP POLICY IF EXISTS "Update own or shared documents" ON documents;
DROP POLICY IF EXISTS "Delete own documents" ON documents;
DROP POLICY IF EXISTS "Documents: Select" ON documents;
DROP POLICY IF EXISTS "Documents: Insert" ON documents;
DROP POLICY IF EXISTS "Documents: Update" ON documents;
DROP POLICY IF EXISTS "Documents: Delete" ON documents;

DROP POLICY IF EXISTS "Creators can view shares" ON document_shares;
DROP POLICY IF EXISTS "Shared users can view their share" ON document_shares;
DROP POLICY IF EXISTS "Creators can add shares" ON document_shares;
DROP POLICY IF EXISTS "Creators can remove shares" ON document_shares;
DROP POLICY IF EXISTS "View shares" ON document_shares;
DROP POLICY IF EXISTS "Creators can view/manage shares" ON document_shares;
DROP POLICY IF EXISTS "Receivers can view their own share" ON document_shares;
DROP POLICY IF EXISTS "Shares: Creator can manage" ON document_shares;
DROP POLICY IF EXISTS "Shares: Receiver can view" ON document_shares;

-- Helper Functions (SECURITY DEFINER to bypass RLS and avoid recursion)

-- 1. Check if I am the creator of a document
CREATE OR REPLACE FUNCTION public.check_is_document_creator(doc_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM documents 
    WHERE id = doc_id 
    AND created_by = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Check if a document is shared with me
CREATE OR REPLACE FUNCTION public.check_is_document_shared(doc_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM document_shares 
    WHERE document_id = doc_id 
    AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- DOCUMENT POLICIES
-- Uses the helper function for the "Shared" check to avoid RLS complexity
CREATE POLICY "Documents: Select" ON documents
  FOR SELECT USING (
    created_by = auth.uid() 
    OR 
    public.check_is_document_shared(id)
  );

CREATE POLICY "Documents: Insert" ON documents
  FOR INSERT WITH CHECK (created_by = auth.uid());

CREATE POLICY "Documents: Update" ON documents
  FOR UPDATE USING (
    created_by = auth.uid() 
    OR 
    public.check_is_document_shared(id)
  );

CREATE POLICY "Documents: Delete" ON documents
  FOR DELETE USING (created_by = auth.uid());


-- SHARE POLICIES
-- Uses the helper function for the "Creator" check to avoid RLS complexity
CREATE POLICY "Shares: Creator can manage" ON document_shares
  FOR ALL USING (
    public.check_is_document_creator(document_id)
  );

CREATE POLICY "Shares: Receiver can view" ON document_shares
  FOR SELECT USING (
    user_id = auth.uid()
  );
