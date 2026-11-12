// Regelbasierter Assistent: versteht Zeiträume, Sparten, Kennzahlen und einige Büro-Fragen.
// Läuft komplett im Browser, keine externe KI, keine Kosten.
import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
  subWeeks,
  subYears,
} from 'date-fns';
import { de } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';
import { DEFAULT_RULES, isOfficeClosed, planAssignee, type ReceptionRule } from '@/lib/reception';
import { getStatusConfig, isStatusFresh } from '@/lib/status';
import { fetchCarryover, vacationDaysUsedInYear } from '@/lib/vacation';

export type BrainAnswer = { text: string; actions?: { label: string; href: string }[] };
export type BrainContext = { userId: string; isAdmin: boolean; firstName?: string };

const eur = (n: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
const num = (n: number) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(n);
const ymd = (d: Date) => format(d, 'yyyy-MM-dd');

/* ------------------------------------------------------------------ */
/* Zeitraum erkennen                                                   */
/* ------------------------------------------------------------------ */

type Period = { from: Date; to: Date; label: string; previous: () => Period };

const MONTHS = ['januar', 'februar', 'maerz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember'];
const MONTHS_SHORT = ['jan', 'feb', 'mrz', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dez'];

const monthPeriod = (d: Date): Period => ({
  from: startOfMonth(d),
  to: endOfMonth(d),
  label: `im ${format(d, 'MMMM yyyy', { locale: de })}`,
  previous: () => monthPeriod(subMonths(d, 1)),
});
const weekPeriod = (d: Date, label?: string): Period => ({
  from: startOfWeek(d, { weekStartsOn: 1 }),
  to: endOfWeek(d, { weekStartsOn: 1 }),
  label: label || `in KW ${format(d, 'w', { locale: de })}`,
  previous: () => weekPeriod(subWeeks(d, 1)),
});
const yearPeriod = (d: Date): Period => ({
  from: startOfYear(d),
  to: endOfYear(d),
  label: `im Jahr ${d.getFullYear()}`,
  previous: () => yearPeriod(subYears(d, 1)),
});
const dayPeriod = (d: Date, label: string): Period => ({ from: d, to: d, label, previous: () => dayPeriod(subDays(d, 1), `am ${format(subDays(d, 1), 'd. MMMM', { locale: de })}`) });

export const parsePeriod = (t: string, now = new Date()): Period | null => {
  if (/\bheute\b/.test(t)) return dayPeriod(now, 'heute');
  if (/\bgestern\b/.test(t)) return dayPeriod(subDays(now, 1), 'gestern');
  if (/(diese|dieser|aktuelle)n? woche/.test(t)) return weekPeriod(now, 'diese Woche');
  if (/(letzte|vorige|vergangene)n? woche/.test(t)) return weekPeriod(subWeeks(now, 1), 'letzte Woche');
  if (/(dieses|aktuelle) jahr|\bjahr\b(?! \d)/.test(t) && !/letzte|vorige/.test(t)) return yearPeriod(now);
  if (/(letztes|voriges|vergangenes) jahr|vorjahr/.test(t)) return yearPeriod(subYears(now, 1));
  if (/(letzte|vorige|vergangene)n? monat|vormonat/.test(t)) return monthPeriod(subMonths(now, 1));
  if (/(diese|dieser|aktuelle)n? monat/.test(t)) return monthPeriod(now);

  const q = t.match(/\bq([1-4])\b|(\d)\.? quartal/);
  if (q) {
    const n = Number(q[1] || q[2]);
    const from = new Date(now.getFullYear(), (n - 1) * 3, 1);
    const p = (y: number): Period => ({
      from: new Date(y, (n - 1) * 3, 1),
      to: endOfMonth(new Date(y, (n - 1) * 3 + 2, 1)),
      label: `im ${n}. Quartal ${y}`,
      previous: () => p(y - 1),
    });
    return p(from > now ? now.getFullYear() - 1 : now.getFullYear());
  }

  for (let i = 0; i < 12; i++) {
    const re = new RegExp(`\\b(${MONTHS[i]}|${MONTHS_SHORT[i]})\\b\\.?\\s*(\\d{4})?`);
    const m = t.match(re);
    if (m) {
      let year = m[2] ? Number(m[2]) : now.getFullYear();
      // "im Dezember" im Januar meint den letzten Dezember
      if (!m[2] && new Date(year, i, 1) > now) year -= 1;
      return monthPeriod(new Date(year, i, 1));
    }
  }
  const y = t.match(/\b(20\d{2})\b/);
  if (y) return yearPeriod(new Date(Number(y[1]), 0, 1));
  return null;
};

/* ------------------------------------------------------------------ */
/* Sparte und Kennzahl erkennen                                        */
/* ------------------------------------------------------------------ */

const SUBCATS: { re: RegExp; sub?: string[]; cat?: string; label: string }[] = [
  { re: /\bbu\b|berufsunfaehig/, sub: ['BU'], label: 'BU' },
  { re: /lebensversicherung|\bleben\b|rente|altersvorsorge/, cat: 'life', label: 'Leben' },
  { re: /kv[ -]?voll|vollversicher/, sub: ['KV Voll'], label: 'KV Voll' },
  { re: /zusatz/, sub: ['KV Zusatz'], label: 'KV Zusatz' },
  { re: /reise/, sub: ['Reise-KV'], label: 'Reise-KV' },
  { re: /kranken|\bkv\b/, cat: 'health', label: 'Kranken' },
  { re: /\bphv\b|haftpflicht/, sub: ['PHV'], label: 'PHV' },
  { re: /hausrat|\bhr\b/, sub: ['HR'], label: 'Hausrat' },
  { re: /unfall|\bunf\b/, sub: ['UNF'], label: 'Unfall' },
  { re: /\bsach\b/, cat: 'property', label: 'Sach' },
  { re: /kfz|\bauto\b|fahrzeug/, cat: 'car', label: 'KFZ' },
  { re: /rechtsschutz/, cat: 'legal', label: 'Rechtsschutz' },
];

type Metric = 'count' | 'commission' | 'lv' | 'cancelled' | 'all';

const parseMetric = (t: string): Metric => {
  if (/storn/.test(t)) return 'cancelled';
  if (/wie ?viele|anzahl|vertraege|abschluesse|abgeschlossen/.test(t) && !/provision|umsatz|lebenswert/.test(t)) return 'count';
  if (/lebenswert|\blw\b|bewertung/.test(t)) return 'lv';
  if (/provision|umsatz|verdient|einnahmen|courtage|geld/.test(t)) return 'commission';
  return 'all';
};

const isProductionQuestion = (t: string) =>
  /provision|umsatz|verdient|einnahmen|lebenswert|\blw\b|vertraege|vertrag|abschluess|abgeschlossen|storn|produktion|policiert|eingereicht/.test(t) ||
  (/wie ?viele/.test(t) && SUBCATS.some((s) => s.re.test(t)));

/* ------------------------------------------------------------------ */
/* Produktion                                                          */
/* ------------------------------------------------------------------ */

type Row = { commission_amount: number | null; life_values: number | null; status: string; category: string; sub_category: string | null; user_id: string };

const sumUp = (rows: Row[]) => {
  const active = rows.filter((r) => r.status !== 'cancelled');
  return {
    count: active.length,
    cancelled: rows.length - active.length,
    commission: active.reduce((a, r) => a + Number(r.commission_amount || 0), 0),
    lv: active.reduce((a, r) => a + Number(r.life_values || 0), 0),
  };
};

const describe = (s: ReturnType<typeof sumUp>, metric: Metric) => {
  switch (metric) {
    case 'count':
      return `**${s.count}** ${s.count === 1 ? 'Vertrag' : 'Verträge'}`;
    case 'commission':
      return `**${eur(s.commission)}** Provision`;
    case 'lv':
      return `**${num(s.lv)}** Lebenswerte`;
    case 'cancelled':
      return `**${s.cancelled}** ${s.cancelled === 1 ? 'Storno' : 'Stornos'}`;
    default:
      return `**${s.count}** ${s.count === 1 ? 'Vertrag' : 'Verträge'}, **${eur(s.commission)}** Provision und **${num(s.lv)}** Lebenswerte`;
  }
};

const productionAnswer = async (t: string, ctx: BrainContext): Promise<BrainAnswer> => {
  const period = parsePeriod(t) || monthPeriod(new Date());
  const metric = parseMetric(t);
  const filter = SUBCATS.find((s) => s.re.test(t));
  const team = /\b(team|alle|gesamt|wir|buero|agentur)\b/.test(t);
  const compare = /vergleich|vorher|vormonat|vorjahr|als (im|letzte)|mehr als|weniger als|besser|schlechter/.test(t);

  if (team && !ctx.isAdmin) {
    return { text: 'Zahlen für das ganze Team sieht nur die Büroleitung. Ich kann dir deine eigenen Zahlen nennen, frag zum Beispiel „Meine Provision im Oktober“.' };
  }

  const load = async (p: Period) => {
    let q = supabase
      .from('production_entries')
      .select('commission_amount, life_values, status, category, sub_category, user_id')
      .gte('submission_date', ymd(p.from))
      .lte('submission_date', ymd(p.to));
    if (!team) q = q.eq('user_id', ctx.userId);
    if (filter?.sub) q = q.in('sub_category', filter.sub);
    if (filter?.cat) q = q.eq('category', filter.cat);
    const { data, error } = await q;
    if (error) throw error;
    return sumUp((data as Row[]) || []);
  };

  const now = await load(period);
  const who = team ? 'Das Team hat' : 'Du hast';
  const what = filter ? ` (${filter.label})` : '';
  let text = `${who} ${period.label}${what} ${describe(now, metric)}.`;
  if (now.cancelled > 0 && metric !== 'cancelled' && metric !== 'count') text += ` Dazu kommen ${now.cancelled} stornierte, die nicht mitzählen.`;

  if (compare) {
    const prevP = period.previous();
    const prev = await load(prevP);
    const key = metric === 'all' ? 'commission' : metric;
    const a = now[key as keyof typeof now] as number;
    const b = prev[key as keyof typeof prev] as number;
    const diff = a - b;
    const fmt = key === 'commission' ? eur : num;
    text += `\n${prevP.label.replace(/^im |^in /, 'Zum Vergleich ')}: ${describe(prev, metric)}. ${diff === 0 ? 'Gleichstand.' : `Das sind ${fmt(Math.abs(diff))} ${diff > 0 ? 'mehr' : 'weniger'}.`}`;
  }

  return { text, actions: [{ label: 'Produktion öffnen', href: '/production' }] };
};

/* ------------------------------------------------------------------ */
/* Monatsziel und Prognose                                             */
/* ------------------------------------------------------------------ */

const goalAnswer = async (ctx: BrainContext): Promise<BrainAnswer> => {
  const today = new Date();
  const [{ data: me }, { data: rows }] = await Promise.all([
    supabase.from('profiles').select('monthly_goal').eq('id', ctx.userId).maybeSingle(),
    supabase
      .from('production_entries')
      .select('commission_amount, life_values, status, category, sub_category, user_id')
      .eq('user_id', ctx.userId)
      .gte('submission_date', ymd(startOfMonth(today)))
      .lte('submission_date', ymd(endOfMonth(today))),
  ]);
  const goal = Number(me?.monthly_goal) || 10000;
  const s = sumUp((rows as Row[]) || []);
  const days = eachDayOfInterval({ start: startOfMonth(today), end: endOfMonth(today) }).filter((d) => !isOfficeClosed(d));
  const passed = days.filter((d) => d <= today).length || 1;
  const projected = Math.round((s.lv / passed) * days.length);
  const missing = Math.max(goal - s.lv, 0);
  const left = days.length - passed;
  const perDay = left > 0 ? Math.ceil(missing / left) : missing;
  let text = `Monatsziel: **${num(goal)}** Lebenswerte. Erreicht: **${num(s.lv)}** (${Math.round((s.lv / goal) * 100)} %).\nBei deinem bisherigen Tempo landest du bei etwa **${num(projected)}**.`;
  text += missing === 0 ? '\nZiel schon geschafft.' : left > 0 ? `\nEs fehlen ${num(missing)}, also rund ${num(perDay)} pro Arbeitstag in den restlichen ${left} Tagen.` : `\nEs fehlen ${num(missing)}.`;
  return { text, actions: [{ label: 'Zur Übersicht', href: '/' }] };
};

/* ------------------------------------------------------------------ */
/* Urlaub                                                              */
/* ------------------------------------------------------------------ */

const vacationAnswer = async (ctx: BrainContext): Promise<BrainAnswer> => {
  const year = new Date().getFullYear();
  const [{ data: me }, { data: abs }, carry] = await Promise.all([
    supabase.from('profiles').select('total_vacation_days, is_vocational_student, vocational_school_days').eq('id', ctx.userId).maybeSingle(),
    supabase
      .from('absences')
      .select('type, start_date, end_date, status, deduct_vacation_days, used_days')
      .eq('user_id', ctx.userId)
      .eq('type', 'vacation')
      .in('status', ['approved', 'pending'])
      .gte('end_date', `${year}-01-01`)
      .lte('start_date', `${year}-12-31`),
    fetchCarryover(ctx.userId, year),
  ]);
  // Gleiche Rechnung wie im Urlaubskonto (Jahreswechsel, Feiertage, Berufsschule)
  const total = (Number(me?.total_vacation_days) || 30) + carry;
  const rows = (abs || []) as Parameters<typeof vacationDaysUsedInYear>[0];
  const approved = vacationDaysUsedInYear(rows.filter((a) => a.status === 'approved'), year, me);
  const pending = vacationDaysUsedInYear(rows.filter((a) => a.status === 'pending'), year, me);
  const left = total - approved - pending;
  let text = `Du hast ${year} **${num(left)}** von ${total} Urlaubstagen übrig.`;
  if (pending > 0) text += ` Davon sind ${num(pending)} Tage beantragt, aber noch nicht genehmigt.`;
  return { text, actions: [{ label: 'Urlaubskonto öffnen', href: '/vacation' }] };
};

/* ------------------------------------------------------------------ */
/* Empfang                                                             */
/* ------------------------------------------------------------------ */

const WEEKDAYS = ['sonntag', 'montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag'];

const receptionAnswer = async (t: string): Promise<BrainAnswer> => {
  const now = new Date();
  let day = now;
  let label = 'heute';
  if (/uebermorgen/.test(t)) {
    day = addDays(now, 2);
    label = 'übermorgen';
  } else if (/morgen/.test(t)) {
    day = addDays(now, 1);
    label = 'morgen';
  } else {
    const wd = WEEKDAYS.findIndex((w) => t.includes(w));
    if (wd >= 0) {
      const delta = (wd - now.getDay() + 7) % 7 || 7;
      day = addDays(now, /naechste|kommende/.test(t) && delta < 7 ? delta + 7 : delta);
      label = `am ${format(day, 'EEEE, d. MMMM', { locale: de })}`;
    }
    const dm = t.match(/(\d{1,2})\.(\d{1,2})\.?/);
    if (dm) {
      day = new Date(now.getFullYear(), Number(dm[2]) - 1, Number(dm[1]));
      label = `am ${format(day, 'EEEE, d. MMMM', { locale: de })}`;
    }
  }

  if (isOfficeClosed(day)) return { text: `${label[0].toUpperCase()}${label.slice(1)} ist das Büro geschlossen.` };

  const [rules, override] = await Promise.all([
    supabase.from('reception_rules').select('weekday, persons, rotation_start'),
    supabase.from('reception_overrides').select('person, note').eq('day', ymd(day)).maybeSingle(),
  ]);
  const plan = !rules.error && rules.data?.length ? (rules.data as ReceptionRule[]) : DEFAULT_RULES;
  const person = override.data?.person || planAssignee(day, plan);
  const extra = override.data?.note ? ` (${override.data.note})` : '';
  return { text: `${label[0].toUpperCase()}${label.slice(1)} sitzt **${person}** am Empfang${extra}.`, actions: [{ label: 'Empfangsplan öffnen', href: '/reception' }] };
};

/* ------------------------------------------------------------------ */
/* Wer ist im Büro                                                     */
/* ------------------------------------------------------------------ */

const presenceAnswer = async (): Promise<BrainAnswer> => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const [{ data: profiles }, { data: statuses }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, is_approved'),
    supabase.from('user_status').select('user_id, status, updated_at').gte('updated_at', start.toISOString()).order('updated_at', { ascending: false }),
  ]);
  const latest = new Map<string, { status: string; updated_at: string }>();
  (statuses || []).forEach((s) => !latest.has(s.user_id) && latest.set(s.user_id, s));
  const groups: Record<string, string[]> = {};
  (profiles || [])
    .filter((p) => p.is_approved !== false)
    .forEach((p) => {
      const st = latest.get(p.id);
      const label = st && isStatusFresh(st.updated_at) ? getStatusConfig(st.status)?.label || 'Unbekannt' : 'Noch kein Status';
      (groups[label] = groups[label] || []).push(p.full_name?.split(' ')[0] || '?');
    });
  const order = ['Im Büro', 'Home Office', 'Im Termin', 'Pause', 'Seminar', 'Urlaub', 'Krank', 'Feierabend', 'Noch kein Status'];
  const lines = order.filter((k) => groups[k]).map((k) => `- ${k}: ${groups[k].join(', ')}`);
  return { text: `Stand heute:\n${lines.join('\n')}`, actions: [{ label: 'Verzeichnis öffnen', href: '/directory' }] };
};

/* ------------------------------------------------------------------ */
/* Einstieg                                                            */
/* ------------------------------------------------------------------ */

/** Liefert eine Antwort, wenn die Frage verstanden wurde, sonst null (dann greifen die einfachen Stichwörter). */
export const smartAnswer = async (normalized: string, ctx: BrainContext): Promise<BrainAnswer | null> => {
  const t = ` ${normalized} `;
  if (/empfang|rezeption|laufkundschaft/.test(t)) return receptionAnswer(t);
  if (/urlaubstag|resturlaub|urlaub (habe|hab) ich|wie viel urlaub|wieviel urlaub/.test(t)) return vacationAnswer(ctx);
  if (/\bziel\b|monatsziel|schaffe ich|prognose|wie weit bin ich/.test(t)) return goalAnswer(ctx);
  if (/wer ist (im buero|da|hier|anwesend|im home ?office)|wer arbeitet|wer ist heute/.test(t) && !/krank|urlaub/.test(t)) return presenceAnswer();
  if (isProductionQuestion(t)) return productionAnswer(t, ctx);
  return null;
};

export const EXAMPLE_QUESTIONS = ['Wie viele BU-Verträge hatte ich im Oktober?', 'Provision diesen Monat im Vergleich', 'Schaffe ich mein Ziel?', 'Wer ist morgen am Empfang?', 'Wie viele Urlaubstage habe ich noch?'];
