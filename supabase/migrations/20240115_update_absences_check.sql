ALTER TABLE absences
DROP CONSTRAINT IF EXISTS absences_type_check;

ALTER TABLE absences
ADD CONSTRAINT absences_type_check
CHECK (type IN ('vacation', 'sick_leave', 'other', 'seminar', 'school'));
