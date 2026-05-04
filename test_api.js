import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function test() {
  // First login as some user if we have credentials, but we don't.
  // Wait, we can't update without auth because of RLS.
  // Can we just fetch the schema?
  // Try to select a single profile to see if total_vacation_days is returned.
  const { data, error } = await supabase.from('profiles').select('total_vacation_days').limit(1);
  if (error) {
    console.error("Error fetching total_vacation_days:", error.message);
  } else {
    console.log("Success! Column exists. Data:", data);
  }
}
test();
