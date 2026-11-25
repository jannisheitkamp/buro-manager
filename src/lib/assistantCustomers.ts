// Assistent, Teil Kunden: Lücken, Geburtstage, Kündigungsfristen und Kundensuche.
// Regelbasiert und im Browser, keine externe KI. Liest nur, was die Person laut RLS ohnehin sehen darf.
import { addYears, differenceInCalendarDays, differenceInYears, format, startOfDay } from 'date-fns';
import { de } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';
import { customerGaps, GAP_GROUP_LABELS, type GapRule } from '@/lib/gaps';
import { loadProducts, productByName } from '@/lib/products';
import { upcomingDeadlines } from '@/lib/followups';
import type { BrainAnswer, BrainContext } from '@/lib/assistantBrain';

type C = {
  id: string;
  created_by: string | null;
  last_name: string;
  first_name: string | null;
  birth_date: string | null;
  phone: string | null;
  email: string | null;
  customer_type: 'person' | 'company';
  occupation: string | null;
  marital_status: string | null;
  children: number | null;
  housing: string | null;
  vehicles: string[] | null;
  pets: string[] | null;
  employees: number | null;
};
type E = { id: string; customer_id: string | null; user_id: string; managed_by: string | null; status: string; category: string; sub_category: string | null; start_date: string | null; customer_name: string; customer_firstname: string | null; policy_number: string | null };
type X = { id: string; customer_id: string; created_by: string; category: string; sub_category: string; start_date: string | null; policy_number: string | null };

const MAX_NAMES = 8;
const name = (c: Pick<C, 'last_name' | 'first_name'>) => `${c.last_name}${c.first_name ? `, ${c.first_name}` : ''}`;
const fold = (s: string) => s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
const listNames = (names: string[]) => names.slice(0, MAX_NAMES).join(' · ') + (names.length > MAX_NAMES ? ` und ${names.length - MAX_NAMES} weitere` : '');

/** Wörter für Lückengruppen, so wie man sie im Büro sagt */
const GAP_WORDS: Record<string, RegExp> = {
  phv: /privathaftpflicht|\bphv\b|(?<!hunde|pferde|betriebs|berufs)haftpflicht/,
  hr: /hausrat|\bhr\b/,
  rs: /rechtsschutz/,
  unf: /unfall/,
  akv: /\bbu\b|berufsunfaehig|arbeitskraft|grundfaehig/,
  av: /altersvorsorge|rente\b|\bbav\b|vorsorge/,
  kv: /krankenvoll|\bpkv\b|kv voll/,
  pflege: /pflege/,
  wg: /wohngebaeude|gebaeude/,
  rlv: /risiko ?(leben|lv)|hinterbliebene|\brlv\b/,
  kinv: /kinderinvalid/,
  kfz: /\bkfz\b|\bauto\b/,
  krad: /motorrad/,
  hund: /hundehaftpflicht/,
  pferd: /pferdehaftpflicht/,
  tierkv: /tier ?(op|kranken)/,
  bhv: /betriebshaftpflicht/,
  cyber: /cyber/,
  bkv: /\bbkv\b/,
};

type Data = { customers: C[]; entries: E[]; existing: X[]; rules: GapRule[] };

async function loadData(): Promise<Data> {
  const [c, e, x, r] = await Promise.all([
    supabase.from('customers').select('id, created_by, last_name, first_name, birth_date, phone, email, customer_type, occupation, marital_status, children, housing, vehicles, pets, employees'),
    supabase.from('production_entries').select('id, customer_id, user_id, managed_by, status, category, sub_category, start_date, customer_name, customer_firstname, policy_number'),
    supabase.from('customer_contracts').select('id, customer_id, created_by, category, sub_category, start_date, policy_number'),
    supabase.from('gap_rules').select('*'),
    loadProducts(),
  ]);
  if (c.error) throw c.error;
  return { customers: (c.data as C[]) || [], entries: (e.data as E[]) || [], existing: (x.data as X[]) || [], rules: (r.data as GapRule[]) || [] };
}

/** Eigene Kunden: angelegt oder betreut; mit „alle/team“ der ganze Bestand */
function scoped(d: Data, ctx: BrainContext, team: boolean) {
  if (team) return d.customers;
  const mine = new Set<string>();
  d.entries.forEach((e) => e.customer_id && (e.user_id === ctx.userId || e.managed_by === ctx.userId) && mine.add(e.customer_id));
  d.existing.forEach((x) => x.created_by === ctx.userId && mine.add(x.customer_id));
  return d.customers.filter((c) => c.created_by === ctx.userId || mine.has(c.id));
}

function gapsOf(c: C, d: Data) {
  const active = d.entries.filter((e) => e.customer_id === c.id && e.status !== 'cancelled');
  const prior = d.existing.filter((x) => x.customer_id === c.id);
  const hasLife = c.customer_type === 'company' || !!(c.occupation || c.marital_status || c.housing || c.children || c.vehicles?.length || c.pets?.length);
  if (!active.length && !prior.length && !hasLife) return { labels: [] as string[], groups: new Set<string>() };
  const covered = new Set([...active.map((e) => e.sub_category || e.category), ...prior.map((x) => x.sub_category)].map((n) => productByName(n)?.gap_group).filter((g): g is string => !!g));
  const rules = d.rules.filter((r) => r.active);
  const labels = customerGaps(rules, c, covered);
  const groups = new Set(rules.filter((r) => labels.includes(r.label)).map((r) => r.gap_group));
  return { labels, groups };
}

/* ---------------------------------------------------------------- Lücken */

const gapAnswer = async (t: string, ctx: BrainContext, team: boolean): Promise<BrainAnswer> => {
  const d = await loadData();
  const list = scoped(d, ctx, team);
  const group = gapGroupIn(t);
  const rows = list.map((c) => ({ c, ...gapsOf(c, d) })).filter((r) => r.labels.length > 0);
  const whose = team ? 'Im Bestand' : 'Bei deinen Kunden';

  if (group) {
    const hit = rows.filter((r) => r.groups.has(group)).sort((a, b) => name(a.c).localeCompare(name(b.c), 'de'));
    const label = GAP_GROUP_LABELS[group] || group;
    if (!hit.length) return { text: `${whose} fehlt niemandem **${label}**, soweit Lebenslage und Lückenregeln das erkennen.`, actions: [{ label: 'Lückenliste öffnen', href: '/customers' }] };
    return {
      text: `${whose} fehlt **${label}** bei **${hit.length}** ${hit.length === 1 ? 'Kunde' : 'Kunden'}: ${listNames(hit.map((r) => name(r.c)))}.`,
      actions: [{ label: 'Lückenliste öffnen', href: '/customers' }],
    };
  }

  // Ohne bestimmte Sparte: die häufigsten Lücken
  const counts = new Map<string, number>();
  rows.forEach((r) => r.labels.forEach((l) => counts.set(l, (counts.get(l) || 0) + 1)));
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (!top.length) return { text: `${whose} sind keine Lücken offen.` };
  return {
    text: `${whose} haben **${rows.length}** ${rows.length === 1 ? 'Kunde' : 'Kunden'} offene Lücken. Am häufigsten:\n${top.map(([l, n]) => `- ${l}: ${n}`).join('\n')}\nFrag zum Beispiel „Wer hat keine Haftpflicht?“.`,
    actions: [{ label: 'Lückenliste öffnen', href: '/customers' }],
  };
};

/* ---------------------------------------------------------------- Geburtstage */

const birthdayAnswer = async (t: string, ctx: BrainContext, team: boolean): Promise<BrainAnswer> => {
  const d = await loadData();
  const days = /heute/.test(t) ? 0 : /morgen/.test(t) ? 1 : /monat/.test(t) ? 31 : 7;
  const today = startOfDay(new Date());
  const hits = scoped(d, ctx, team)
    .filter((c) => c.birth_date)
    .map((c) => {
      const b = new Date(`${c.birth_date}T00:00:00`);
      let next = new Date(today.getFullYear(), b.getMonth(), b.getDate());
      if (next < today) next = addYears(next, 1);
      return { c, next, in: differenceInCalendarDays(next, today), age: differenceInYears(next, b) };
    })
    .filter((r) => (days === 1 ? r.in === 1 : r.in <= days))
    .sort((a, b) => a.in - b.in);
  const when = days === 0 ? 'heute' : days === 1 ? 'morgen' : days === 31 ? 'in den nächsten 31 Tagen' : 'in den nächsten 7 Tagen';
  if (!hits.length) return { text: `${when[0].toUpperCase()}${when.slice(1)} hat keiner ${team ? 'im Bestand' : 'deiner Kunden'} Geburtstag.` };
  return {
    text: `Geburtstage ${when}:\n${hits.slice(0, 12).map((r) => `- ${name(r.c)}, wird ${r.age} (${r.in === 0 ? 'heute' : format(r.next, 'EEE d. MMM', { locale: de })})${r.c.phone ? ` · ${r.c.phone}` : ''}`).join('\n')}`,
    actions: [{ label: 'Kunden öffnen', href: '/customers' }],
  };
};

/* ---------------------------------------------------------------- Fristen */

const deadlineAnswer = async (ctx: BrainContext, team: boolean): Promise<BrainAnswer> => {
  const d = await loadData();
  const ids = new Set(scoped(d, ctx, team).map((c) => c.id));
  const byId = new Map(d.customers.map((c) => [c.id, c]));
  const prior = d.existing.map((x) => {
    const c = byId.get(x.customer_id);
    return { ...x, status: 'policed', customer_name: c?.last_name || '', customer_firstname: c?.first_name || null };
  });
  const list = upcomingDeadlines([...d.entries, ...prior].filter((e) => e.customer_id && ids.has(e.customer_id)));
  if (!list.length) return { text: 'In den nächsten 60 Tagen läuft keine Kündigungsfrist ab.', actions: [{ label: 'Kunden öffnen', href: '/customers' }] };
  return {
    text: `**${list.length}** ${list.length === 1 ? 'Frist' : 'Fristen'} in den nächsten 60 Tagen:\n${list
      .slice(0, 10)
      .map((f) => `- ${f.entry.customer_name}${f.entry.customer_firstname ? `, ${f.entry.customer_firstname}` : ''}: ${f.entry.sub_category} bis ${format(f.deadline, 'dd.MM.')} (noch ${f.daysLeft} ${f.daysLeft === 1 ? 'Tag' : 'Tage'})`)
      .join('\n')}`,
    actions: [{ label: 'Fristen öffnen', href: '/customers' }],
  };
};

/* ---------------------------------------------------------------- Kunde suchen */

const STOP = new Set(['von', 'vom', 'der', 'die', 'das', 'des', 'den', 'dem', 'frau', 'herr', 'herrn', 'kunde', 'kundin', 'kunden', 'telefon', 'telefonnummer', 'nummer', 'handy', 'mail', 'email', 'e', 'adresse', 'was', 'hat', 'welche', 'vertraege', 'ist', 'wie', 'lautet', 'gib', 'mir', 'zeig', 'zeige', 'mal', 'bitte', 'luecken', 'fehlt', 'infos', 'zu', 'ueber', 'akte']);

const customerAnswer = async (t: string): Promise<BrainAnswer | null> => {
  const words = t.split(/[^a-z0-9-]+/).filter((w) => w.length > 1 && !STOP.has(w));
  if (!words.length) return null;
  const d = await loadData();
  const hits = d.customers.filter((c) => {
    const n = fold(`${c.last_name} ${c.first_name || ''}`);
    return words.every((w) => n.split(/\s+/).some((p) => p.startsWith(w)));
  });
  if (!hits.length) return null;
  if (hits.length > 1) {
    return {
      text: `Ich finde ${hits.length} passende Kunden: ${listNames(hits.map(name))}. Nenn mir auch den Vornamen.`,
      actions: hits.slice(0, 3).map((c) => ({ label: name(c), href: `/customers?c=${c.id}` })),
    };
  }
  const c = hits[0];
  const products = [
    ...d.entries.filter((e) => e.customer_id === c.id && e.status !== 'cancelled').map((e) => e.sub_category || e.category),
    ...d.existing.filter((x) => x.customer_id === c.id).map((x) => `${x.sub_category} (Bestand)`),
  ];
  const { labels } = gapsOf(c, d);
  const lines = [
    c.phone ? `Telefon: ${c.phone}` : 'Keine Telefonnummer hinterlegt',
    c.email ? `E-Mail: ${c.email}` : null,
    c.birth_date ? `Geboren ${format(new Date(`${c.birth_date}T00:00:00`), 'dd.MM.yyyy')}` : null,
    `Verträge: ${products.length ? products.join(', ') : 'keine'}`,
    labels.length ? `Fehlt: ${labels.join(', ')}` : null,
  ].filter(Boolean);
  return { text: `**${name(c)}**\n${lines.map((l) => `- ${l}`).join('\n')}`, actions: [{ label: 'Kundenakte öffnen', href: `/customers?c=${c.id}` }] };
};

/* ---------------------------------------------------------------- Einstieg */

export type CustomerIntent = 'birthday' | 'deadline' | 'gap' | 'lookup';

/** Welche Kundenfrage ist das? Reine Textregel, damit sie testbar bleibt */
export function customerIntent(t: string): CustomerIntent | null {
  if (/geburtstag/.test(t)) return 'birthday';
  if (/kuendigungsfrist|frist|laeuft ab|laufen ab|ablauf|wechselstichtag/.test(t)) return 'deadline';
  if (/luecke|\b(ohne|kein|keine|keinen|fehlt|fehlen)\b.*\b(versicher|absicher|haftpflicht|hausrat|bu|rente|unfall|rechtsschutz|pflege|kfz|auto|vorsorge|gebaeude|risiko|cyber|bkv|bav|motorrad|tier)/.test(t)) return 'gap';
  if (/telefon|nummer|handy|mail|adresse|kunde|kundin|akte|was hat|infos zu|vertraege von/.test(t)) return 'lookup';
  return null;
}

/** Welche Lückengruppe ist gemeint? */
export const gapGroupIn = (t: string) => Object.entries(GAP_WORDS).find(([, re]) => re.test(t))?.[0] || null;

/** Kundenfragen beantworten; null, wenn es keine ist */
export const customerBrain = async (t: string, ctx: BrainContext): Promise<BrainAnswer | null> => {
  const team = /\b(team|alle kunden|gesamt|bestand|buero|agentur)\b/.test(t);
  switch (customerIntent(t)) {
    case 'birthday':
      return birthdayAnswer(t, ctx, team);
    case 'deadline':
      return deadlineAnswer(ctx, team);
    case 'gap':
      return gapAnswer(t, ctx, team);
    case 'lookup':
      return customerAnswer(t);
    default:
      return null;
  }
};
