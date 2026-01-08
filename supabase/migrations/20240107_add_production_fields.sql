ALTER TABLE production_entries
ADD COLUMN IF NOT EXISTS managed_by UUID REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS commission_received_date DATE;
