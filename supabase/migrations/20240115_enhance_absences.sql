ALTER TABLE absences
ADD COLUMN note text,
ADD COLUMN is_recurring boolean DEFAULT false,
ADD COLUMN recurrence_interval text CHECK (recurrence_interval IN ('weekly', 'biweekly', 'monthly'));
