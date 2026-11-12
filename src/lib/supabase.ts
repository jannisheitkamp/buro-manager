import { createClient } from '@supabase/supabase-js';

// Öffentliche Projektwerte als Standard. Der Anon-Key ist laut Supabase für den Browser gedacht;
// geschützt werden die Daten über Row Level Security. Über VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
// lassen sich die Werte überschreiben (z. B. für ein Testprojekt).
const DEFAULT_URL = 'https://snvdxjpoqfniyhtfqkza.supabase.co';
const DEFAULT_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNudmR4anBvcWZuaXlodGZxa3phIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5NTYzNTYsImV4cCI6MjA4MTUzMjM1Nn0.fuGLbLdOrVp4eCAEJziu-GbhvgSHul9-FSriCzd5nzs';

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || DEFAULT_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
