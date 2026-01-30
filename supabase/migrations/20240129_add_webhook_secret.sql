
-- Add webhook_secret to profiles for external integrations (e.g. Apple Shortcuts)
ALTER TABLE profiles ADD COLUMN webhook_secret text;
