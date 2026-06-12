CREATE TABLE IF NOT EXISTS public.call_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    customer_name TEXT NOT NULL,
    phone_number TEXT,
    call_time TIMESTAMPTZ DEFAULT now() NOT NULL,
    reachability TEXT NOT NULL, -- 'erreicht', 'nicht_erreicht', 'falsche_nummer', 'mailbox'
    status TEXT NOT NULL, -- 'erledigt', 'wiedervorlage', 'termin_vereinbart'
    notes TEXT,
    follow_up_date DATE,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view all call logs"
ON public.call_logs FOR SELECT
USING (true);

CREATE POLICY "Users can insert their own call logs"
ON public.call_logs FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own call logs"
ON public.call_logs FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own call logs"
ON public.call_logs FOR DELETE
USING (auth.uid() = user_id);

-- Create index for faster queries on follow_up_date
CREATE INDEX IF NOT EXISTS idx_call_logs_follow_up_date ON public.call_logs(follow_up_date);
CREATE INDEX IF NOT EXISTS idx_call_logs_user_id ON public.call_logs(user_id);
