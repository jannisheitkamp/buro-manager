-- Create user_badges table
CREATE TABLE IF NOT EXISTS public.user_badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    badge_name TEXT NOT NULL,
    badge_icon TEXT NOT NULL,
    badge_color TEXT NOT NULL,
    description TEXT,
    awarded_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

-- Create Policies
CREATE POLICY "Everyone can read user_badges"
    ON public.user_badges
    FOR SELECT
    USING (true);

-- Admins can insert/update/delete (assuming role 'admin' in profiles or just open for now for testing)
CREATE POLICY "Users can manage badges"
    ON public.user_badges
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Create a helper function to award a badge
CREATE OR REPLACE FUNCTION public.award_badge(
    p_user_id UUID,
    p_name TEXT,
    p_icon TEXT,
    p_color TEXT,
    p_desc TEXT
) RETURNS UUID AS $$
DECLARE
    v_badge_id UUID;
BEGIN
    INSERT INTO public.user_badges (user_id, badge_name, badge_icon, badge_color, description)
    VALUES (p_user_id, p_name, p_icon, p_color, p_desc)
    RETURNING id INTO v_badge_id;
    
    RETURN v_badge_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;