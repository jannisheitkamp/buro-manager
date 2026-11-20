import { createClient } from '@supabase/supabase-js';
import { createDemoClient } from '@/lib/demo/client';

// Öffentliche Projektwerte als Standard. Der Anon-Key ist laut Supabase für den Browser gedacht;
// geschützt werden die Daten über Row Level Security. Über VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
// lassen sich die Werte überschreiben (z. B. für ein Testprojekt).
const DEFAULT_URL = 'https://snvdxjpoqfniyhtfqkza.supabase.co';
const DEFAULT_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNudmR4anBvcWZuaXlodGZxa3phIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5NTYzNTYsImV4cCI6MjA4MTUzMjM1Nn0.fuGLbLdOrVp4eCAEJziu-GbhvgSHul9-FSriCzd5nzs';

/** Demo-Version: ohne Anmeldung, mit erfundenen Daten im Browser (VITE_DEMO=true beim Bauen) */
export const IS_DEMO = import.meta.env.VITE_DEMO === 'true';

// In der Demo stehen die echten Projektwerte gar nicht erst im gebauten Code
export const supabaseUrl = IS_DEMO ? 'https://demo.example.com' : import.meta.env.VITE_SUPABASE_URL || DEFAULT_URL;
const supabaseAnonKey = IS_DEMO ? 'demo' : import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_ANON_KEY;

const createRealClient = () => createClient(supabaseUrl, supabaseAnonKey);

// In der Demo wird gar keine Verbindung zur echten Datenbank aufgebaut
export const supabase: ReturnType<typeof createRealClient> = IS_DEMO
  ? (createDemoClient() as ReturnType<typeof createRealClient>)
  : createRealClient();
