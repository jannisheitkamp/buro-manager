ALTER TABLE public.absences
ADD COLUMN IF NOT EXISTS deduct_vacation_days BOOLEAN DEFAULT TRUE;

UPDATE public.absences
SET deduct_vacation_days = TRUE
WHERE deduct_vacation_days IS NULL;

