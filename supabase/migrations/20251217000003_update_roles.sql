-- Update the role check constraint to include new roles
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles 
ADD CONSTRAINT profiles_role_check 
CHECK (role IN (
  'admin', 
  'employee', 
  'gruppe_vaupel', 
  'gruppe_kalies', 
  'selbststaendig', 
  'tim', 
  'morris', 
  'vaupel', 
  'jannis', 
  'flori', 
  'marcio'
));
