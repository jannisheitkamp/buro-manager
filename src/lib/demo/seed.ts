/* eslint-disable @typescript-eslint/no-explicit-any */
// Erfundene Beispieldaten für die Demo. Alle Personen, Kunden und Nummern sind ausgedacht.
// Die Daten werden relativ zum heutigen Tag erzeugt, damit die Demo immer aktuell wirkt.

import { SEED_PRODUCTS } from '@/lib/products';
import { GAP_RULE_SEED } from '@/lib/gaps';

export type DemoDb = Record<string, Record<string, any>[]>;

export const DEMO_USER_ID = '00000000-0000-4000-8000-000000000001';

const TEAM = [
  { id: DEMO_USER_ID, first: 'Alex', last: 'Berger', roles: ['admin', 'employee'], ext: '21' },
  { id: '00000000-0000-4000-8000-000000000002', first: 'Mia', last: 'Schulte', roles: ['employee', 'gruppe_vertrieb'], ext: '22' },
  { id: '00000000-0000-4000-8000-000000000003', first: 'Jonas', last: 'Keller', roles: ['employee', 'gruppe_vertrieb'], ext: '23' },
  { id: '00000000-0000-4000-8000-000000000004', first: 'Lena', last: 'Hoffmann', roles: ['employee'], ext: '24' },
  { id: '00000000-0000-4000-8000-000000000005', first: 'Tom', last: 'Richter', roles: ['selbststaendig'], ext: '25' },
  { id: '00000000-0000-4000-8000-000000000006', first: 'Sara', last: 'Yilmaz', roles: ['employee'], ext: '26' },
];
const [ME, MIA, JONAS, LENA, TOM, SARA] = TEAM.map((t) => t.id);
const TRAINEE = SARA;

const FIRST = ['Anna', 'Bernd', 'Clara', 'David', 'Elif', 'Felix', 'Greta', 'Hannes', 'Ida', 'Jan', 'Klara', 'Lukas', 'Marie', 'Noah', 'Olga', 'Paul', 'Rosa', 'Simon', 'Tina', 'Uwe', 'Vera', 'Willi', 'Yara', 'Zoe'];
const LAST = ['Albers', 'Brandt', 'Conrad', 'Dietrich', 'Engel', 'Fuchs', 'Graf', 'Hartmann', 'Jansen', 'Krüger', 'Lange', 'Möller', 'Neumann', 'Otto', 'Peters', 'Roth', 'Seidel', 'Thiel', 'Vogt', 'Winter'];

// Fester Zufall, damit die Demo bei jedem Laden gleich aussieht
let s = 20261120;
const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const between = (a: number, b: number) => a + rnd() * (b - a);
const round2 = (n: number) => Math.round(n * 100) / 100;

const today = new Date();
today.setHours(0, 0, 0, 0);
const Y = today.getFullYear();
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (n: number) => { const d = new Date(today); d.setDate(d.getDate() + n); return d; };
const at = (days: number, h: number, m = 0) => { const d = addDays(days); d.setHours(h, m, 0, 0); return d.toISOString(); };
const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;
const workday = (n: number) => { let d = addDays(n); while (isWeekend(d)) d = new Date(d.getTime() + (n < 0 ? -1 : 1) * 86400000); return d; };

const RATES: Record<string, number> = { Leben: 8, BU: 8, 'KV Voll': 3, 'KV Zusatz': 3, 'Reise-KV': 10, PHV: 7.5, HR: 7.5, UNF: 7.5, Sach: 7.5, KFZ: 3, Rechtsschutz: 5, Sonstige: 5 };
const CATEGORY: Record<string, string> = { Leben: 'life', BU: 'life', 'KV Voll': 'health', 'KV Zusatz': 'health', 'Reise-KV': 'health', PHV: 'property', HR: 'property', UNF: 'property', Sach: 'property', KFZ: 'car', Rechtsschutz: 'legal', Sonstige: 'other' };
const STEP: Record<string, number> = { monthly: 1, quarterly: 3, half_yearly: 6, yearly: 12, one_time: 12 };
const FACTOR: Record<string, number> = { monthly: 12, quarterly: 4, half_yearly: 2, yearly: 1, one_time: 1 };

/** Vertrag wie im Formular berechnen (Provision, Bewertungssumme, Lebenswerte) */
function contract(o: { user: string; manager?: string; sub: string; submitted: Date; start: Date; pay: string; gross: number; net?: number; duration?: number; status: string; customer: [string, string] }) {
  const rate = RATES[o.sub];
  const cat = CATEGORY[o.sub];
  const net = o.net ?? o.gross;
  const f = FACTOR[o.pay];
  const dur = Math.min(o.duration ?? 1, 35);
  let valuation = 0, comm = 0;
  if (o.sub === 'Leben' || o.sub === 'BU') { valuation = o.gross * f * dur; comm = valuation * rate / 1000; }
  else if (o.sub === 'KV Voll' || o.sub === 'KV Zusatz') { valuation = o.gross; comm = o.gross * rate; }
  else if (o.sub === 'Reise-KV') { valuation = o.gross * f; comm = valuation * rate / 100; }
  else {
    valuation = net * f;
    const startMonth = o.start.getMonth();
    const rates = o.pay === 'one_time' ? 1 : Math.floor((11 - startMonth) / STEP[o.pay]) + 1;
    comm = net * rate / 100 * rates;
  }
  const lvFactor = cat === 'life' ? 1.147 : cat === 'car' ? 1 : cat === 'health' ? 0 : 20;
  const lv = (cat === 'life' ? valuation : net * f) * lvFactor;
  const policed = o.status === 'policed';
  return {
    id: crypto.randomUUID(),
    user_id: o.user,
    managed_by: o.manager ?? o.user,
    submission_date: ymd(o.submitted),
    policy_number: policed ? String(Math.floor(between(220000000, 769999999))) : null,
    customer_name: o.customer[1],
    customer_firstname: o.customer[0],
    category: cat,
    sub_category: o.sub,
    start_date: ymd(o.start),
    payment_method: o.pay,
    duration: o.duration ?? 1,
    net_premium: round2(net),
    gross_premium: round2(o.gross),
    commission_rate: rate,
    valuation_sum: round2(valuation),
    commission_amount: comm,
    liability_rate: 0,
    status: o.status,
    policing_date: policed ? ymd(new Date(o.submitted.getTime() + 9 * 86400000)) : null,
    commission_received_date: null,
    life_value_factor: lvFactor,
    life_values: lv,
    insurance_company: null,
    notes: null,
    document_url: null,
    cancelled_at: o.status === 'cancelled' ? ymd(new Date(o.submitted.getTime() + 40 * 86400000)) : null,
    cancel_reason: o.status === 'cancelled' ? pick(['Widerruf', 'Kündigung durch Kunde', 'Nichtzahlung']) : null,
    cancel_note: null,
    created_at: o.submitted.toISOString(),
  };
}

export function createSeed(): DemoDb {
  s = 20261120;
  const customers: [string, string][] = [];
  const customer = (): [string, string] => {
    if (customers.length > 6 && rnd() < 0.3) return pick(customers);
    const c: [string, string] = [pick(FIRST), pick(LAST)];
    customers.push(c);
    return c;
  };

  const profiles = TEAM.map((t, i) => ({
    id: t.id,
    email: `${t.first.toLowerCase()}.${t.last.toLowerCase()}@example.com`,
    full_name: `${t.first} ${t.last}`,
    avatar_url: null,
    created_at: new Date(Y - 1, 2 + i, 3).toISOString(),
    roles: t.roles,
    supervisor_ids: t.id === ME ? [] : [ME],
    address: null,
    is_approved: true,
    agency_number: String(100200300 + i * 111),
    phone_extension: t.ext,
    monthly_goal: t.id === ME ? 30000 : 20000,
    yearly_goal: t.id === ME ? 360000 : 240000,
    total_vacation_days: 30,
    // Sara ist Azubi bei Alex: so lässt sich das Berichtsheft ausprobieren
    is_vocational_student: t.id === TRAINEE,
    boss_id: t.id === TRAINEE ? ME : null,
    vocational_school_days: t.id === TRAINEE ? [{ dayOfWeek: 2, type: 'full' }, { dayOfWeek: 4, type: 'half' }] : null,
    webhook_secret: null,
    todoist_api_key: null,
  }));

  /* ---------------- Produktion ---------------- */
  const production: any[] = [];
  const thisMonth = today.getMonth();
  const MIX: [string, string, number, number, number?][] = [
    // Sparte, Zahlweise, Brutto von, bis, Laufzeit
    ['Leben', 'monthly', 50, 150, 30],
    ['BU', 'monthly', 40, 90, 32],
    ['KV Zusatz', 'monthly', 15, 60],
    ['KV Voll', 'monthly', 350, 650],
    ['PHV', 'yearly', 60, 110],
    ['PHV', 'monthly', 5, 9],
    ['HR', 'yearly', 80, 160],
    ['UNF', 'monthly', 12, 30],
    ['Sach', 'monthly', 20, 60],
    ['KFZ', 'monthly', 40, 110],
    ['KFZ', 'quarterly', 150, 320],
    ['Rechtsschutz', 'monthly', 20, 35],
    ['Reise-KV', 'yearly', 10, 25],
  ];
  const addFor = (user: string, perMonth: [number, number]) => {
    for (let m = 0; m <= thisMonth; m++) {
      const n = Math.round(between(perMonth[0], perMonth[1]));
      for (let k = 0; k < n; k++) {
        const [sub, pay, lo, hi, dur] = pick(MIX);
        const day = Math.min(1 + Math.floor(rnd() * 27), m === thisMonth ? Math.max(today.getDate() - 1, 1) : 28);
        const submitted = new Date(Y, m, day);
        const start = new Date(Y, m + 1, 1);
        const recent = m === thisMonth || (m === thisMonth - 1 && rnd() < 0.5);
        const status = recent ? 'submitted' : rnd() < 0.06 ? 'cancelled' : 'policed';
        const gross = round2(between(lo, hi));
        production.push(contract({ user, manager: rnd() < 0.2 ? pick([MIA, JONAS]) : undefined, sub, submitted, start, pay, gross, net: sub === 'BU' || sub === 'Leben' ? round2(gross * 0.8) : gross, duration: dur, status, customer: customer() }));
      }
    }
  };
  addFor(ME, [2, 4]);
  // Ein guter Monat: ein größerer Lebensvertrag diesen Monat
  production.push(contract({ user: ME, sub: 'Leben', submitted: workday(-2), start: new Date(Y, thisMonth + 1, 1), pay: 'monthly', gross: 55, net: 44, duration: 30, status: 'submitted', customer: ['Paula', 'Albers'] }));
  production.push(contract({ user: ME, sub: 'PHV', submitted: workday(-2), start: new Date(Y, thisMonth + 1, 1), pay: 'yearly', gross: 79, status: 'submitted', customer: ['Paula', 'Albers'] }));
  // Sachverträge aus dem Vorjahr: bringen dieses Jahr Courtage, ein Teil ist in der Wechselfrist
  for (let k = 0; k < 7; k++) {
    const sub = pick(['PHV', 'HR', 'KFZ', 'KFZ', 'Sach', 'Rechtsschutz']);
    const pay = sub === 'KFZ' ? pick(['monthly', 'quarterly']) : pick(['monthly', 'yearly']);
    const startMonth = k < 3 ? (thisMonth + 2 + k) % 12 : Math.floor(rnd() * 12);
    const gross = round2(sub === 'KFZ' ? between(40, 110) * (pay === 'quarterly' ? 3 : 1) : between(8, 30) * (pay === 'yearly' ? 12 : 1));
    production.push(contract({ user: ME, sub, submitted: new Date(Y - 1, startMonth, 10), start: new Date(Y - 1, startMonth, 1), pay, gross, status: 'policed', customer: customer() }));
  }
  addFor(MIA, [1, 3]);
  addFor(JONAS, [1, 3]);
  addFor(LENA, [1, 2]);
  addFor(TOM, [0, 2]);
  addFor(SARA, [1, 2]);

  const commission_settings = Object.entries(RATES).map(([sub, rate]) => ({ id: crypto.randomUUID(), user_id: ME, category: CATEGORY[sub], sub_category: sub, rate_value: rate, created_at: new Date(Y, 0, 2).toISOString(), updated_at: null }));

  // Courtage aus dem Vorjahr ist schon ausgezahlt
  const courtage_payouts = production
    .filter((e) => e.user_id === ME && e.start_date < `${Y}-01-01` && ['PHV', 'HR', 'UNF', 'Sach', 'KFZ', 'Rechtsschutz', 'Sonstige'].includes(e.sub_category))
    .map((e) => ({ entry_id: e.id, year: Y - 1, received_date: `${Y - 1}-12-31`, created_by: ME, created_at: new Date(Y, 0, 5).toISOString() }));

  /* ---------------- Status, Empfang ---------------- */
  const user_status = [
    { user_id: ME, status: 'office', message: null },
    { user_id: MIA, status: 'vacation', message: 'bis Ende der Woche' },
    { user_id: JONAS, status: 'meeting', message: 'Kundentermin bis 11 Uhr' },
    { user_id: LENA, status: 'remote', message: null },
    { user_id: TOM, status: 'office', message: null },
    { user_id: SARA, status: 'break', message: 'zurück um 13 Uhr' },
  ].map((x, i) => ({ id: crypto.randomUUID(), ...x, updated_at: new Date(Date.now() - (i + 1) * 23 * 60000).toISOString() }));

  const reception_rules = [
    { weekday: 1, persons: ['Alex', 'Jonas'] },
    { weekday: 2, persons: ['Lena'] },
    { weekday: 3, persons: ['Jonas'] },
    { weekday: 4, persons: ['Alex'] },
    { weekday: 5, persons: ['Sara', 'Lena'] },
  ].map((r) => ({ ...r, rotation_start: `${Y}-01-05`, updated_at: null, updated_by: ME }));

  // Tauschanfrage für einen Tag, an dem Lena laut Plan dran ist (dienstags)
  let swapDay = addDays(1);
  while (swapDay.getDay() !== 2) swapDay = new Date(swapDay.getTime() + 86400000);
  const reception_swaps = [{ id: crypto.randomUUID(), day: ymd(swapDay), from_user: LENA, to_user: ME, note: 'Habe da einen Zahnarzttermin', status: 'pending', created_at: at(-1, 15), responded_at: null }];

  /* ---------------- Anrufe ---------------- */
  const phone_calls: any[] = [];
  for (let d = -13; d <= 0; d++) {
    if (isWeekend(addDays(d))) continue;
    const n = Math.round(between(2, 7));
    for (let k = 0; k < n; k++) {
      const missed = rnd() < 0.3;
      const name = `${pick(FIRST)} ${pick(LAST)}`;
      const done = missed && (d < -1 || rnd() < 0.4);
      phone_calls.push({
        id: crypto.randomUUID(),
        created_at: at(d, 8 + Math.floor(rnd() * 9), Math.floor(rnd() * 60)),
        caller_number: `0231 ${Math.floor(between(1000000, 9999999))}`,
        callee_number: '0231 5550',
        direction: 'inbound',
        status: missed ? 'missed' : 'answered',
        duration: missed ? 0 : Math.floor(between(40, 600)),
        external_id: null,
        agent_extension: pick(TEAM).ext,
        notes: `Anrufer: ${name}${done ? ' · erledigt' : ''}`,
        user_id: null,
      });
    }
  }

  const callbacks = [
    { customer_name: 'Greta Hartmann', phone: '0231 4471209', topic: 'Fragen zur Hausratversicherung nach Umzug', priority: 'high', status: 'open', assigned_to: ME, created_by: SARA, created_at: at(0, 9, 12) },
    { customer_name: 'Felix Brandt', phone: '0172 5532190', topic: 'Möchte ein Angebot für eine BU', priority: 'normal', status: 'open', assigned_to: ME, created_by: LENA, created_at: at(-1, 14, 40) },
    { customer_name: 'Rosa Seidel', phone: '0231 9083311', topic: 'Schaden am Auto melden', priority: 'high', status: 'open', assigned_to: JONAS, created_by: ME, created_at: at(0, 8, 30) },
    { customer_name: 'Bernd Krüger', phone: '0157 2210983', topic: 'Rückruf wegen Beitragserhöhung', priority: 'normal', status: 'open', assigned_to: null, created_by: TOM, created_at: at(-2, 11, 5) },
    { customer_name: 'Ida Neumann', phone: '0231 1188442', topic: 'Kündigung Rechtsschutz besprechen', priority: 'normal', status: 'done', assigned_to: ME, created_by: MIA, created_at: at(-4, 10), completed_at: at(-3, 9), completed_by: ME },
    { customer_name: 'Uwe Roth', phone: '0231 7766554', topic: 'Termin für Jahresgespräch', priority: 'normal', status: 'done', assigned_to: SARA, created_by: ME, created_at: at(-6, 16), completed_at: at(-5, 10), completed_by: SARA },
  ].map((c) => ({ id: crypto.randomUUID(), completed_at: null, completed_by: null, ...c }));

  const call_logs = [
    { customer_name: 'Klara Möller', phone_number: '0231 3344556', reachability: 'erreicht', status: 'erledigt', notes: 'Angebot PHV zugeschickt', call_time: at(0, 10, 15), follow_up_date: null },
    { customer_name: 'Simon Vogt', phone_number: '0176 9988776', reachability: 'nicht erreicht', status: 'wiedervorlage', notes: 'Mailbox, morgen erneut versuchen', call_time: at(-1, 15, 30), follow_up_date: ymd(addDays(1)) },
    { customer_name: 'Vera Engel', phone_number: '0231 6655443', reachability: 'erreicht', status: 'termin', notes: 'Beratungstermin vereinbart', call_time: at(-2, 9, 45), follow_up_date: ymd(workday(3)) },
  ].map((l) => ({ id: crypto.randomUUID(), user_id: ME, created_at: l.call_time, updated_at: l.call_time, reach_time: null, follow_up_time: l.follow_up_date ? '10:00' : null, follow_up_notified_at: null, ...l }));

  /* ---------------- Leads ---------------- */
  const leadStages: [string, string, string][] = [
    ['new', 'Hannes Peters', 'BU'], ['new', 'Elif Graf', 'Hausrat'], ['new', 'Noah Lange', 'KFZ'],
    ['contacted', 'Marie Conrad', 'Altersvorsorge'], ['contacted', 'Paul Thiel', 'PHV'],
    ['proposal', 'Tina Jansen', 'BU'], ['proposal', 'Willi Otto', 'Rechtsschutz'],
    ['closed', 'Zoe Winter', 'Leben'], ['closed', 'Jan Fuchs', 'KFZ'],
  ];
  const leads = leadStages.map(([status, name, product], i) => ({
    id: crypto.randomUUID(), user_id: ME, customer_name: name, status, product,
    phone: `0231 ${2000000 + i * 13579}`, email: `${name.split(' ')[0].toLowerCase()}@example.com`,
    availability: pick(['vormittags', 'nach 17 Uhr', 'mittwochs']), notes: pick(['Empfehlung von Bestandskunde', 'Über die Website', 'Messe-Kontakt', '']),
    next_call_at: null, last_call_at: null, call_attempts: 0, next_call_notified_at: null,
    created_at: at(-3 * (i + 1), 10), updated_at: at(-i, 10),
  }));

  /* ---------------- Pakete ---------------- */
  const parcels = [
    { recipient_id: ME, carrier: 'DHL', location: 'Empfang', status: 'pending', created_at: at(0, 9, 40), tracking_number: null },
    { recipient_id: JONAS, carrier: 'DPD', location: 'Lager', status: 'pending', created_at: at(-1, 13, 5), tracking_number: null },
    { recipient_id: LENA, carrier: 'Amazon', location: 'Unterwegs', status: 'expected', created_at: at(0, 7), tracking_number: null },
    { recipient_id: ME, carrier: 'Hermes', location: 'Empfang', status: 'collected', created_at: at(-3, 11), collected_at: at(-3, 16), tracking_number: null },
    { recipient_id: SARA, carrier: 'UPS', location: 'Empfang', status: 'collected', created_at: at(-5, 10), collected_at: at(-5, 12), tracking_number: null },
  ].map((p) => ({ id: crypto.randomUUID(), created_by: TOM, collected_at: null, ...p }));

  /* ---------------- Abwesenheiten ---------------- */
  const abs = (user: string, type: string, from: number, to: number, status: string, extra: any = {}) => ({
    id: crypto.randomUUID(), user_id: user, type, start_date: ymd(addDays(from)), end_date: ymd(addDays(to)), status, note: null,
    is_recurring: false, recurrence_interval: null, deduct_vacation_days: true, used_days: null, certificate_url: null, signature_url: null,
    approved_by: status === 'approved' ? ME : null, approved_at: status === 'approved' ? at(from - 14, 10) : null, approver_signature_url: null, half_day: false,
    created_at: at(from - 20, 9), ...extra,
  });
  const absences = [
    abs(MIA, 'vacation', -1, 3, 'approved'),
    abs(TOM, 'sick_leave', -8, -6, 'approved', { deduct_vacation_days: false }),
    abs(JONAS, 'vacation', 21, 30, 'pending'),
    abs(SARA, 'seminar', 9, 10, 'approved', { deduct_vacation_days: false }),
    abs(ME, 'vacation', -120, -110, 'approved'),
    abs(ME, 'vacation', -60, -56, 'approved'),
    abs(ME, 'vacation', 33, 37, 'approved'),
    abs(LENA, 'vacation', 12, 12, 'pending', { half_day: true }),
  ];

  /* ---------------- Planung ---------------- */
  const calendar_events = [
    { title: 'Teambesprechung', start_time: at(0, 9), end_time: at(0, 9, 45), user_id: ME, location: 'Besprechungsraum', color: 'blue', description: 'Wochenstart, Zahlen, Termine' },
    { title: 'Beratung Familie Albers', start_time: at(0, 15), end_time: at(0, 16), user_id: ME, location: 'Büro', color: 'green', description: null },
    { title: 'Schulung Rechtsschutz', start_time: at(2, 10), end_time: at(2, 12), user_id: LENA, location: 'Online', color: 'yellow', description: null },
    { title: 'Jahresgespräch Herr Thiel', start_time: at(4, 14), end_time: at(4, 15), user_id: JONAS, location: 'Büro', color: 'green', description: null },
    { title: 'Monatsabschluss', start_time: at(7, 16), end_time: at(7, 17), user_id: ME, location: 'Besprechungsraum', color: 'red', description: null },
  ].map((e) => ({ id: crypto.randomUUID(), created_at: at(-5, 10), ...e }));

  const bookings = [
    { title: 'Teambesprechung', start_time: at(0, 9), end_time: at(0, 9, 45), user_id: ME },
    { title: 'Kundentermin Seidel', start_time: at(0, 13, 30), end_time: at(0, 14, 30), user_id: JONAS },
    { title: 'Beratung Familie Albers', start_time: at(0, 15), end_time: at(0, 16), user_id: ME },
  ].map((b) => ({ id: crypto.randomUUID(), resource_name: 'Besprechungsraum', created_at: at(-2, 10), ...b }));

  /* ---------------- Team ---------------- */
  const posts = [
    { user_id: ME, type: 'announcement', title: 'Wechselsaison KFZ läuft', content: 'Bis zum 30.11. können Kunden ihre KFZ-Versicherung wechseln. Bitte schaut unter „Kunden“ nach euren Fristen und ruft eure KFZ-Kunden an.', created_at: at(-1, 8, 30) },
    { user_id: LENA, type: 'task', title: 'Kaffeemaschine entkalken', content: 'Wer diese Woche Empfang hat, bitte einmal entkalken. Anleitung liegt in der Schublade.', created_at: at(-3, 12) },
    { user_id: SARA, type: 'announcement', title: 'Weihnachtsfeier', content: 'Die Weihnachtsfeier ist am zweiten Freitag im Dezember ab 18 Uhr. Tragt euch bitte in der Umfrage ein.', created_at: at(-6, 10) },
  ].map((p) => ({ id: crypto.randomUUID(), ...p }));

  const pollA = crypto.randomUUID();
  const pollB = crypto.randomUUID();
  const opt = (poll: string, text: string) => ({ id: crypto.randomUUID(), poll_id: poll, text });
  const poll_options = [opt(pollA, 'Italienisch'), opt(pollA, 'Griechisch'), opt(pollA, 'Burger'), opt(pollB, 'Ja, neue Maschine'), opt(pollB, 'Nein, reicht noch')];
  const vote = (poll: string, o: number, user: string) => ({ id: crypto.randomUUID(), poll_id: poll, option_id: poll_options[o].id, user_id: user, created_at: at(-2, 12) });
  const polls = [
    { id: pollA, question: 'Wo gehen wir zur Weihnachtsfeier essen?', created_by: SARA, is_active: true, created_at: at(-6, 10) },
    { id: pollB, question: 'Neue Kaffeemaschine anschaffen?', created_by: LENA, is_active: true, created_at: at(-3, 12) },
  ];
  const poll_votes = [vote(pollA, 0, MIA), vote(pollA, 1, JONAS), vote(pollA, 0, LENA), vote(pollA, 2, TOM), vote(pollB, 3, SARA), vote(pollB, 3, JONAS), vote(pollB, 4, TOM)];

  const docA = crypto.randomUUID();
  const docB = crypto.randomUUID();
  const documents = [
    { id: docA, title: 'Leitfaden Erstberatung', content: '<h2>Ablauf</h2><p>1. Bedarf klären, 2. Absicherung prüfen, 3. Angebot erstellen.</p>', file_path: null, file_type: 'text', created_by: ME, created_at: at(-20, 10), updated_at: at(-4, 10) },
    { id: docB, title: 'Checkliste Schadenmeldung', content: '<p>Schadennummer, Datum, Fotos, Polizeibericht falls vorhanden.</p>', file_path: null, file_type: 'text', created_by: LENA, created_at: at(-12, 10), updated_at: at(-12, 10) },
  ];
  const document_shares = [{ id: crypto.randomUUID(), document_id: docB, user_id: ME, created_at: at(-12, 10) }];

  const notifications = [
    { kind: 'absence_request', title: 'Urlaub-Antrag von Jonas', body: `${ymd(addDays(21)).slice(8)}.${ymd(addDays(21)).slice(5, 7)}. bis ${ymd(addDays(30)).slice(8)}.${ymd(addDays(30)).slice(5, 7)}.`, link: '/calendar', created_at: at(-1, 16) },
    { kind: 'callback', title: 'Neuer Rückruf für dich', body: 'Greta Hartmann: Fragen zur Hausratversicherung', link: '/calls?tab=tasks', created_at: at(0, 9, 12) },
    { kind: 'parcel', title: 'Paket für dich', body: 'DHL, liegt am Empfang', link: '/parcels', created_at: at(0, 9, 40) },
  ].map((n) => ({ id: crypto.randomUUID(), user_id: ME, read_at: null, pushed_at: null, ...n }));

  const user_badges = [
    { badge_name: 'Monatsziel geknackt', badge_icon: '🎯', badge_color: 'emerald', description: 'Monatsziel erreicht', awarded_at: at(-40, 9) },
    { badge_name: '100 Verträge', badge_icon: '🏆', badge_color: 'amber', description: '100 Verträge erfasst', awarded_at: at(-90, 9) },
  ].map((b) => ({ id: crypto.randomUUID(), user_id: ME, ...b }));

  // Kunden aus den Verträgen, mit ein paar Stammdaten
  const customerRows: any[] = [];
  const byKey = new Map<string, any>();
  const streets = ['Lindenweg', 'Hauptstraße', 'Am Markt', 'Schulstraße', 'Gartenstraße', 'Bahnhofstraße'];
  for (const e of production) {
    const k = `${e.customer_name.toLowerCase()}|${(e.customer_firstname || '').toLowerCase()}`;
    let c = byKey.get(k);
    if (!c) {
      const i = customerRows.length;
      // Geburtstag: einige in den nächsten Tagen, der Rest übers Jahr verteilt
      const soon = i % 7 === 2 ? [0, 3, 9][Math.floor(i / 7) % 3] : null;
      const birth = soon !== null ? addDays(soon) : new Date(Y, Math.floor(between(0, 12)), Math.floor(between(1, 28)));
      birth.setFullYear(Y - Math.floor(between(24, 68)));
      c = {
        id: crypto.randomUUID(),
        created_at: e.created_at,
        created_by: e.user_id,
        last_name: e.customer_name,
        first_name: e.customer_firstname,
        birth_date: ymd(birth),
        phone: i % 4 === 3 ? null : `0231 ${Math.floor(between(1000000, 9999999))}`,
        email: i % 3 === 0 ? `${e.customer_firstname.toLowerCase()}.${e.customer_name.toLowerCase()}@example.com`.replace(/[äöüß]/g, (m: string) => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' })[m] as string) : null,
        address: `${pick(streets)} ${Math.floor(between(1, 80))}, 44135 Dortmund`,
        household: null,
        notes: null,
        customer_type: 'person',
        contact_person: null,
        industry: null,
        employees: null,
        // Lebenslage für einen Teil der Kunden
        occupation: i % 3 === 0 ? null : ['employee', 'self_employed', 'employee', 'civil_servant', 'retired'][i % 5],
        marital_status: i % 3 === 0 ? null : ['married', 'single', 'partnership'][i % 3],
        children: i % 3 === 0 ? null : i % 4,
        housing: i % 3 === 0 ? null : ['rent', 'own_house', 'own_flat'][i % 3],
        vehicles: i % 3 === 0 ? [] : i % 4 === 1 ? ['car', 'motorcycle'] : ['car'],
        pets: i % 6 === 1 ? ['dog'] : i % 6 === 4 ? ['cat'] : [],
      };
      byKey.set(k, c);
      customerRows.push(c);
    }
    e.customer_id = c.id;
  }
  // Ein Haushalt mit zwei Personen gleichen Nachnamens
  const families = new Map<string, any[]>();
  customerRows.forEach((c) => families.set(c.last_name, [...(families.get(c.last_name) || []), c]));
  const family = [...families.values()].find((f) => f.length > 1);
  if (family) family.forEach((c: any) => (c.household = `Familie ${c.last_name}`));

  const contract_documents = production
    .filter((e) => e.status === 'policed')
    .slice(0, 12)
    .flatMap((e, i) => [
      { id: crypto.randomUUID(), entry_id: e.id, file_path: `${e.user_id}/police-${i}.pdf`, file_name: `Police_${e.policy_number}.pdf`, kind: 'police', uploaded_by: e.user_id, created_at: e.created_at },
      ...(i % 3 === 0 ? [{ id: crypto.randomUUID(), entry_id: e.id, file_path: `${e.user_id}/antrag-${i}.pdf`, file_name: `Antrag_${e.customer_name}.pdf`, kind: 'antrag', uploaded_by: e.user_id, created_at: e.created_at }] : []),
    ]);

  // Bestandsverträge: Verträge, die Kunden schon vorher hatten
  const insurers = ['Allianz', 'HUK-Coburg', 'ERGO', 'AXA', 'R+V'];
  const existingProducts: [string, string, number][] = [['PHV', 'property', 6.9], ['HR', 'property', 11.4], ['KFZ', 'car', 48.2], ['Rechtsschutz', 'legal', 24.5], ['BU', 'life', 62]];
  const customer_contracts = customerRows.slice(0, 8).flatMap((c: any, i: number) =>
    existingProducts.filter((_, j) => (i + j) % 3 === 0).map(([sub, category, premium], j) => ({
      id: crypto.randomUUID(),
      customer_id: c.id,
      category,
      sub_category: sub,
      insurer: insurers[(i + j) % insurers.length],
      policy_number: `${sub.slice(0, 2).toUpperCase()}-${100000 + i * 37 + j}`,
      start_date: ymd(new Date(2019 + (i % 5), (i * 2 + j) % 12, 1)),
      premium,
      notes: null,
      handled_until: null,
      created_by: c.created_by,
      created_at: c.created_at,
    })),
  );

  // Eine Firma als Kunde
  customerRows.push({
    id: crypto.randomUUID(), created_at: at(-120, 10), created_by: ME, customer_type: 'company',
    last_name: 'Tischlerei Hoffmann GmbH', first_name: null, birth_date: null, phone: '0231 4455667', email: 'info@tischlerei-hoffmann.example',
    address: 'Werkstraße 12, 44147 Dortmund', household: null, notes: null, contact_person: 'Peter Hoffmann', industry: 'Handwerk', employees: 8,
    occupation: null, marital_status: null, children: null, housing: null, vehicles: [], pets: [],
  });

  const insurance_products = SEED_PRODUCTS.map((p) => ({ ...p, id: crypto.randomUUID(), active: true, created_by: null, created_at: at(-400, 9) }));
  const gap_rules = GAP_RULE_SEED.map((r) => ({ ...r, id: crypto.randomUUID(), active: true }));

  // Rückrufe mit bekanntem Kunden verknüpfen
  callbacks.forEach((cb: any) => {
    const c = customerRows.find((x) => `${x.first_name} ${x.last_name}` === cb.customer_name);
    cb.customer_id = c?.id ?? null;
  });

  if (customerRows[1]) {
    const c = customerRows[1];
    callbacks.push({ id: crypto.randomUUID(), customer_name: `${c.first_name} ${c.last_name}`, customer_id: c.id, phone: c.phone, topic: 'Jahresgespräch vereinbaren', priority: 'normal', status: 'open', assigned_to: ME, created_by: ME, created_at: at(-1, 11) } as any);
  }

  /* ---------------- Berichtsheft ---------------- */
  const monday = (weeksAgo: number) => { const d = addDays(-((today.getDay() + 6) % 7) - 7 * weeksAgo); return ymd(d); };
  const REPORTS: [number, string, string, string, string][] = [
    [5, 'approved', 'Post bearbeitet, Kundendaten im System gepflegt, beim Empfang mitgeholfen.', 'Einführung in die Sparten der Sachversicherung.', 'Grundlagen Versicherungsvertrag, VVG.'],
    [4, 'approved', 'Angebote für Hausrat vorbereitet, Rückrufe angenommen und weitergegeben.', 'Beratungsgespräch Hausrat begleitet.', 'Hausratversicherung: versicherte Gefahren.'],
    [3, 'approved', 'Kfz-Wechselgeschäft: Verträge geprüft, Kunden angeschrieben.', 'Schulung Tarifrechner Kfz.', 'Kfz-Haftpflicht und Kasko.'],
    [1, 'submitted', 'Beim Jahresgespräch mit einem Kunden dabei gewesen, Lückenliste erstellt.', 'Gesprächsführung am Telefon.', 'Privathaftpflicht, Deckungssummen.'],
  ];
  const training_reports = REPORTS.map(([w, status, company, training, school]) => ({
    id: crypto.randomUUID(),
    user_id: TRAINEE,
    week_start: monday(w),
    company,
    training,
    school,
    status,
    submitted_at: at(-7 * w + 4, 16),
    reviewed_by: status === 'approved' ? ME : null,
    reviewed_at: status === 'approved' ? at(-7 * w + 7, 9) : null,
    review_note: null,
    created_at: at(-7 * w + 4, 15),
    updated_at: at(-7 * w + 4, 16),
  }));

  return {
    training_reports,
    profiles,
    customers: customerRows,
    contract_documents,
    customer_contracts,
    insurance_products,
    gap_rules,
    production_entries: production,
    user_commission_settings: commission_settings,
    courtage_payouts,
    contract_followups: [],
    production_lv_snapshots: [],
    user_status,
    reception_rules,
    reception_overrides: [],
    reception_swaps,
    phone_calls,
    callbacks,
    call_logs,
    leads,
    parcels,
    absences,
    vacation_carryover: [],
    calendar_events,
    bookings,
    posts,
    polls,
    poll_options,
    poll_votes,
    documents,
    document_shares,
    notifications,
    user_badges,
    calendar_tokens: [],
    push_subscriptions: [],
    audit_log: [],
  };
}
