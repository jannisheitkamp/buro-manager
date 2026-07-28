ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS is_vocational_student BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS vocational_school_days JSONB DEFAULT '[]'::jsonb;
