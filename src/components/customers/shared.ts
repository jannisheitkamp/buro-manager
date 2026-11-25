// Gemeinsame Typen und Helfer der Kundenakte
import { addYears, differenceInCalendarDays, differenceInYears, startOfDay } from 'date-fns';
import { HOUSING, MARITAL, OCCUPATIONS, PETS, VEHICLES } from '@/lib/gaps';

export type Entry = {
  id: string;
  user_id: string;
  managed_by: string | null;
  customer_id: string | null;
  status: 'submitted' | 'policed' | 'cancelled';
  category: string;
  sub_category: string | null;
  start_date: string | null;
  submission_date: string;
  customer_name: string;
  customer_firstname: string | null;
  policy_number: string | null;
  commission_amount: number | null;
  life_values: number | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
};

export type Customer = {
  id: string;
  created_at: string;
  created_by: string | null;
  last_name: string;
  first_name: string | null;
  birth_date: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  household: string | null;
  notes: string | null;
  customer_type: 'person' | 'company';
  contact_person: string | null;
  industry: string | null;
  employees: number | null;
  occupation: string | null;
  marital_status: string | null;
  children: number | null;
  housing: string | null;
  vehicles: string[] | null;
  pets: string[] | null;
};

/** Bestandsvertrag: lag schon vor der Produktion vor, zählt nicht zur Provision */
export type Existing = {
  id: string;
  customer_id: string;
  category: string;
  sub_category: string;
  insurer: string | null;
  policy_number: string | null;
  start_date: string | null;
  end_date: string | null;
  main_due: string | null;
  premium: number | null;
  notes: string | null;
  handled_until: string | null;
  created_by: string;
};
/** Bestandsvertrag in Vertragsform, damit Fristen ihn mitberechnen */
export type DeadlineEntry = Entry & { existing?: Existing };

export type OpenCallback = { id: string; customer_id: string; topic: string | null; priority: string; status: string; created_at: string };
export type Followup = { entry_id: string; due_date: string; state: 'callback' | 'dismissed' };

/** Eine Zeile der Kundenakte: Kunde mit Verträgen, Lücken und Kennzahlen */
export type CustomerRow = {
  customer: Customer;
  name: string;
  entries: Entry[];
  active: Entry[];
  existing: Existing[];
  mine: boolean;
  /** Betreuer: wer die meisten Verträge hält, sonst wer den Kunden angelegt hat */
  owner: string | null;
  cancelled: number;
  gaps: string[];
  lv: number;
  commission: number;
  birthday: ReturnType<typeof nextBirthday> | null;
  callbacks: OpenCallback[];
};

/** So viele Tage im Voraus werden Geburtstage angezeigt */
export const BIRTHDAY_DAYS = 14;

export const nf0 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
export const eur0 = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
export const eur2 = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

export const fullName = (c: Pick<Customer, 'last_name' | 'first_name'>) => `${c.last_name}${c.first_name ? `, ${c.first_name}` : ''}`;
export const entryName = (e: Entry) => `${e.customer_name}${e.customer_firstname ? `, ${e.customer_firstname}` : ''}`;
export const product = (e: Entry) => e.sub_category || e.category;
export const day = (d: string) => new Date(`${d}T00:00:00`);

/** Tage bis zum nächsten Geburtstag (0 = heute) */
export function nextBirthday(birth: string, today = new Date()) {
  const b = day(birth);
  const t = startOfDay(today);
  let next = new Date(t.getFullYear(), b.getMonth(), b.getDate());
  if (next < t) next = addYears(next, 1);
  return { date: next, days: differenceInCalendarDays(next, t), age: differenceInYears(next, b) };
}

/** Hat der Kunde Angaben zur Lebenslage? Dann zeigen wir Lücken auch ohne Vertrag. */
export const hasLifestyle = (c: Customer) =>
  c.customer_type === 'company' || !!(c.occupation || c.marital_status || c.housing || c.children || c.vehicles?.length || c.pets?.length);

const labelOf = (list: readonly { id: string; label: string }[], id: string | null | undefined) => list.find((x) => x.id === id)?.label;
/** Lebenslage in einer Zeile, z. B. „Angestellt · Verheiratet · 2 Kinder · Eigenes Haus · Auto, Hund“ */
export const lifestyleText = (c: Customer) =>
  [
    labelOf(OCCUPATIONS, c.occupation),
    labelOf(MARITAL, c.marital_status),
    c.children ? `${c.children} ${c.children === 1 ? 'Kind' : 'Kinder'}` : null,
    labelOf(HOUSING, c.housing),
    [...(c.vehicles || []).map((v) => labelOf(VEHICLES, v)), ...(c.pets || []).map((v) => labelOf(PETS, v))].filter(Boolean).join(', ') || null,
  ]
    .filter(Boolean)
    .join(' · ');

export type InputChange = React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>;

/** Beitrag aus deutscher Schreibweise lesen: „1.234,50“ → 1234.5 */
export const parseEuro = (v: string) => {
  const s = v.trim().replace(/[€\s]/g, '');
  if (!s) return null;
  return Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
};
