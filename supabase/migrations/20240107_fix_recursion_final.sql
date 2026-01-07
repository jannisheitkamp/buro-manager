-- Fix recursive policies by simplifying access logic
-- Strategy:
-- 1. Document access: (creator = auth.uid) OR (id IN (select document_id from shares where user_id = auth.uid))
-- 2. Share access: (user_id = auth.uid) OR (document_id IN (select id from documents where created_by = auth.uid))

-- To break recursion:
-- We need to ensure that checking #2 (Share access) for the creator doesn't trigger #1 (Document access).
-- When checking shares for a document, we just need to know if the user is the creator of THAT document.
-- We can use a SECURITY DEFINER function to check document ownership without triggering RLS on documents table.

-- Drop everything first to be safe
DROP POLICY IF EXISTS "Access own or shared documents" ON documents;
DROP POLICY IF EXISTS "Insert own documents" ON documents;
DROP POLICY IF EXISTS "Update own or shared documents" ON documents;
DROP POLICY IF EXISTS "Delete own documents" ON documents;
DROP POLICY IF EXISTS "View shares" ON document_shares;
DROP POLICY IF EXISTS "Creators can view/manage shares" ON document_shares;
DROP POLICY IF EXISTS "Receivers can view their own share" ON document_shares;

-- Re-create the helper function if needed (or make sure it exists)
CREATE OR REPLACE FUNCTION public.check_is_document_creator(doc_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Direct lookup, bypassing RLS due to SECURITY DEFINER
  RETURN EXISTS (
    SELECT 1 FROM documents 
    WHERE id = doc_id 
    AND created_by = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- DOCUMENT POLICIES
-- No recursion here yet, just standard checks.
CREATE POLICY "Documents: Select" ON documents
  FOR SELECT USING (
    created_by = auth.uid() 
    OR 
    EXISTS (
      SELECT 1 FROM document_shares 
      WHERE document_shares.document_id = id 
      AND document_shares.user_id = auth.uid()
    )
  );

CREATE POLICY "Documents: Insert" ON documents
  FOR INSERT WITH CHECK (created_by = auth.uid());

CREATE POLICY "Documents: Update" ON documents
  FOR UPDATE USING (
    created_by = auth.uid() 
    OR 
    EXISTS (
      SELECT 1 FROM document_shares 
      WHERE document_shares.document_id = id 
      AND document_shares.user_id = auth.uid()
    )
  );

CREATE POLICY "Documents: Delete" ON documents
  FOR DELETE USING (created_by = auth.uid());


-- SHARE POLICIES
-- Here we use the SECURITY DEFINER function to check "Am I the creator?" 
-- instead of querying the documents table directly with RLS enabled.

CREATE POLICY "Shares: Creator can manage" ON document_shares
  FOR ALL USING (
    public.check_is_document_creator(document_id)
  );

CREATE POLICY "Shares: Receiver can view" ON document_shares
  FOR SELECT USING (
    user_id = auth.uid()
  );
