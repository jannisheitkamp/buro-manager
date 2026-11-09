import { supabase } from '@/lib/supabase';

/**
 * Alle Profilspalten, die jede angemeldete Person sehen darf.
 * Bewusst ohne webhook_secret und todoist_api_key: Die liest jeder nur für sich selbst über getMyWebhookSecret().
 */
export const PROFILE_COLUMNS =
  'id, email, full_name, avatar_url, created_at, roles, address, is_approved, agency_number, phone_extension, monthly_goal, yearly_goal, total_vacation_days, is_vocational_student, vocational_school_days';

/** Kurzform für Verknüpfungen (z. B. Autor eines Beitrags) */
export const PROFILE_PUBLIC = 'id, full_name, avatar_url, email';

/** Eigenes Webhook-Geheimnis lesen (über eine Datenbankfunktion, sobald die Spalte gesperrt ist). */
export const getMyWebhookSecret = async (userId: string): Promise<string> => {
  const rpc = await supabase.rpc('get_my_webhook_secret');
  if (!rpc.error) return (rpc.data as string | null) || '';
  // Fallback, solange die Datenbankfunktion noch nicht eingespielt ist
  const { data } = await supabase.from('profiles').select('webhook_secret').eq('id', userId).maybeSingle();
  return (data as { webhook_secret?: string | null } | null)?.webhook_secret || '';
};
