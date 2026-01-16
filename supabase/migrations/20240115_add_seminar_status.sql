ALTER TABLE user_status
DROP CONSTRAINT IF EXISTS user_status_status_check;

ALTER TABLE user_status
ADD CONSTRAINT user_status_status_check
CHECK (status IN ('office', 'remote', 'break', 'meeting', 'vacation', 'sick', 'off', 'seminar'));
