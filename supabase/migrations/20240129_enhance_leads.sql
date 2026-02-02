
-- Add next_call_at to leads for rescheduling
ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_call_at timestamptz;
-- Add last_call_at to track when we tried
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_call_at timestamptz;
-- Add call_attempts counter
ALTER TABLE leads ADD COLUMN IF NOT EXISTS call_attempts integer DEFAULT 0;
