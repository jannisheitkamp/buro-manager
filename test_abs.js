import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://snvdxjpoqfniyhtfqkza.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNudmR4anBvcWZuaXlodGZxa3phIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5NTYzNTYsImV4cCI6MjA4MTUzMjM1Nn0.fuGLbLdOrVp4eCAEJziu-GbhvgSHul9-FSriCzd5nzs';
const supabase = createClient(supabaseUrl, supabaseKey);

async function fetchA() {
    const { data, error } = await supabase.from('absences').select('*, profiles(full_name)').limit(5);
    console.log(JSON.stringify(data, null, 2));
}

fetchA();