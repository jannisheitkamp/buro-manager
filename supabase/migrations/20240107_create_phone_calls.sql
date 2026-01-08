CREATE TABLE IF NOT EXISTS phone_calls (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    caller_number TEXT,
    callee_number TEXT,
    direction TEXT CHECK (direction IN ('inbound', 'outbound')),
    status TEXT CHECK (status IN ('missed', 'answered', 'busy', 'failed')),
    duration INTEGER DEFAULT 0,
    external_id TEXT, -- 3CX Call ID
    agent_extension TEXT, -- Which extension handled it
    notes TEXT
);

-- Add RLS
ALTER TABLE phone_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Phone calls viewable by authenticated users" 
ON phone_calls FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Phone calls insertable by service role only" 
ON phone_calls FOR INSERT 
TO service_role 
WITH CHECK (true);

-- Allow updates (e.g. adding notes) by authenticated users
CREATE POLICY "Phone calls updatable by authenticated users" 
ON phone_calls FOR UPDATE 
TO authenticated 
USING (true);
