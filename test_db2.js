import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://snvdxjpoqfniyhtfqkza.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNudmR4anBvcWZuaXlodGZxa3phIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5NTYzNTYsImV4cCI6MjA4MTUzMjM1Nn0.fuGLbLdOrVp4eCAEJziu-GbhvgSHul9-FSriCzd5nzs';
const supabase = createClient(supabaseUrl, supabaseKey);

async function restoreDurations() {
    // We update duration back to their original values if they were incorrectly capped to 35
    // Actually, earlier we updated the calculations but left duration untouched in the DB!
    // Let's verify what the durations are currently in the DB.
    const { data, error } = await supabase
      .from('production_entries')
      .select('id, duration, valuation_sum')
      .gt('duration', 35);
      
    if (error) console.error(error);
    else console.log(JSON.stringify(data, null, 2));
}

restoreDurations();