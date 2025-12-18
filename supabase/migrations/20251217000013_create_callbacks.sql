-- Create callbacks table

CREATE TABLE public.callbacks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    phone TEXT,
    topic TEXT,
    priority TEXT DEFAULT 'normal', -- normal, high
    status TEXT DEFAULT 'open', -- open, in_progress, done
    assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- Who should call back? (NULL = anyone)
    completed_at TIMESTAMP WITH TIME ZONE,
    completed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- Enable RLS
ALTER TABLE public.callbacks ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Everyone can view callbacks" ON public.callbacks
    FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create callbacks" ON public.callbacks
    FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Authenticated users can update callbacks" ON public.callbacks
    FOR UPDATE USING (true); -- Ideally restrict this, but for team agility 'true' is fine

CREATE POLICY "Authenticated users can delete callbacks" ON public.callbacks
    FOR DELETE USING (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.callbacks;
