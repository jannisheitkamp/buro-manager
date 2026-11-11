// Kalender-Abo im iCal-Format (iPhone, Outlook, Google).
// Aufruf: /functions/v1/calendar-feed?token=<persönlicher Token>
// Enthält Team-Termine und genehmigte Abwesenheiten der letzten 30 und nächsten 365 Tage.
import { createClient } from 'npm:@supabase/supabase-js@2';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const dateOnly = (s: string) => s.replace(/-/g, '');
const nextDay = (s: string) => {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
};

// Zeilen nach RFC 5545 auf 75 Zeichen umbrechen
const fold = (line: string) => {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = ' ' + rest.slice(74);
  }
  out.push(rest);
  return out.join('\r\n');
};

const ABSENCE: Record<string, string> = {
  vacation: 'Urlaub',
  sick_leave: 'Krank',
  seminar: 'Seminar',
  school: 'Berufsschule',
  other: 'Abwesend',
};

Deno.serve(async (req) => {
  const token = new URL(req.url).searchParams.get('token') || '';
  if (!UUID.test(token)) return new Response('Not found', { status: 404 });

  const { data: owner } = await supabase.from('calendar_tokens').select('user_id').eq('token', token).maybeSingle();
  if (!owner) return new Response('Not found', { status: 404 });

  const from = new Date(Date.now() - 30 * 86400000);
  const to = new Date(Date.now() + 365 * 86400000);

  const [events, absences] = await Promise.all([
    supabase.from('calendar_events').select('id, title, description, location, start_time, end_time').gte('start_time', from.toISOString()).lte('start_time', to.toISOString()),
    supabase
      .from('absences')
      .select('id, type, start_date, end_date, user_id, profiles(full_name)')
      .eq('status', 'approved')
      .gte('end_date', from.toISOString().slice(0, 10))
      .lte('start_date', to.toISOString().slice(0, 10)),
  ]);

  const now = stamp(new Date());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Buero Manager//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Büro Manager',
    'X-WR-TIMEZONE:Europe/Berlin',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];

  for (const e of events.data || []) {
    const start = new Date(e.start_time);
    const end = e.end_time ? new Date(e.end_time) : new Date(start.getTime() + 30 * 60000);
    lines.push(
      'BEGIN:VEVENT',
      `UID:event-${e.id}@buero-manager`,
      `DTSTAMP:${now}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(end)}`,
      fold(`SUMMARY:${esc(e.title || 'Termin')}`),
      ...(e.location ? [fold(`LOCATION:${esc(e.location)}`)] : []),
      ...(e.description ? [fold(`DESCRIPTION:${esc(e.description)}`)] : []),
      'END:VEVENT',
    );
  }

  for (const a of absences.data || []) {
    // Krankheit anderer Personen nicht im Abo zeigen (Gesundheitsdaten)
    if (a.type === 'sick_leave' && a.user_id !== owner.user_id) continue;
    const name = (a.profiles as { full_name?: string } | null)?.full_name || 'Kollege';
    lines.push(
      'BEGIN:VEVENT',
      `UID:absence-${a.id}@buero-manager`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${dateOnly(a.start_date)}`,
      `DTEND;VALUE=DATE:${nextDay(a.end_date)}`,
      fold(`SUMMARY:${esc(`${ABSENCE[a.type] || 'Abwesend'}: ${name}`)}`),
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');

  return new Response(lines.join('\r\n') + '\r\n', {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="buero-manager.ics"',
      'Cache-Control': 'private, max-age=900',
    },
  });
});
