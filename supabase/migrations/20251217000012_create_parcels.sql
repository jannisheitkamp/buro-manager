-- Create parcels table

CREATE TABLE public.parcels (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    recipient_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    created_by UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    carrier TEXT, -- DHL, UPS, Amazon, etc.
    location TEXT DEFAULT 'Empfang', -- Where is it stored?
    status TEXT DEFAULT 'pending', -- pending, collected
    collected_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.parcels ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Everyone can view parcels" ON public.parcels
    FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create parcels" ON public.parcels
    FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Recipients and Creators and Admins can update parcels" ON public.parcels
    FOR UPDATE USING (
        auth.uid() = recipient_id OR 
        auth.uid() = created_by OR
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND 'admin' = ANY(roles))
    );

CREATE POLICY "Creators and Admins can delete parcels" ON public.parcels
    FOR DELETE USING (
        auth.uid() = created_by OR 
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND 'admin' = ANY(roles))
    );

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.parcels;
