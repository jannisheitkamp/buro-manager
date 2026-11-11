// Verschickt eine Benachrichtigung als Push an alle Geräte der Person.
// Wird von der Datenbank (Trigger auf "notifications") mit { id } aufgerufen.
// Die Funktion vertraut dem Aufruf nicht: Sie lädt die Benachrichtigung selbst und
// verschickt jede nur einmal (pushed_at). Ein fremder Aufruf kann also nichts Neues auslösen.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
const subject = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@example.com';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!publicKey || !privateKey) return new Response('VAPID keys missing', { status: 500 });
  webpush.setVapidDetails(subject, publicKey, privateKey);

  let id: string | undefined;
  try {
    ({ id } = await req.json());
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  if (!id) return new Response('Bad request', { status: 400 });

  // Nur frische, noch nicht verschickte Benachrichtigungen; pushed_at sofort setzen (kein Doppelversand)
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: claimed } = await supabase
    .from('notifications')
    .update({ pushed_at: new Date().toISOString() })
    .eq('id', id)
    .is('pushed_at', null)
    .gte('created_at', since)
    .select('id, user_id, title, body, link, kind')
    .maybeSingle();
  if (!claimed) return new Response(JSON.stringify({ sent: 0 }), { headers: { 'Content-Type': 'application/json' } });

  const { data: subs } = await supabase.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', claimed.user_id);

  const { count: unread } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', claimed.user_id)
    .is('read_at', null);

  const payload = JSON.stringify({
    title: claimed.title,
    body: claimed.body || '',
    url: claimed.link || '/',
    tag: claimed.kind,
    badge: unread || 0,
  });

  let sent = 0;
  for (const s of subs || []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 12 });
      sent++;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      // Gerät abgemeldet oder Abo abgelaufen: Eintrag entfernen
      if (status === 404 || status === 410) await supabase.from('push_subscriptions').delete().eq('id', s.id);
      else console.error('Push fehlgeschlagen', status, (err as Error).message);
    }
  }

  return new Response(JSON.stringify({ sent }), { headers: { 'Content-Type': 'application/json' } });
});
