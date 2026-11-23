// Vertragsfristen für Wiedervorlagen
// KFZ: Hauptfälligkeit 1.1., Wechselstichtag 30.11.
// Andere Sachverträge: Ablauf zum Jahrestag des Vertragsbeginns, Kündigungsfrist 3 Monate vorher.

import { addMonths, addYears, differenceInCalendarDays, format, startOfDay } from 'date-fns';
import { isCourtage } from '@/lib/courtage';

/** Ab so vielen Tagen vor der Frist wird erinnert */
export const REMIND_DAYS = 28;
/** So weit voraus werden Fristen angezeigt */
export const LOOKAHEAD_DAYS = 60;

type Entry = {
  id: string;
  status: string;
  category: string;
  sub_category: string | null;
  start_date: string | null;
  customer_name: string;
  customer_firstname: string | null;
  policy_number: string | null;
};

export type Deadline<E extends Entry = Entry> = {
  entry: E;
  kind: 'kfz' | 'renewal';
  /** Letzter Tag zum Kündigen oder Wechseln */
  deadline: Date;
  /** Ablauf bzw. Hauptfälligkeit */
  renewal: Date;
  daysLeft: number;
  /** Innerhalb der Erinnerungsfrist */
  due: boolean;
  key: string;
};

const isKfz = (e: Entry) => e.sub_category === 'KFZ' || e.category === 'car';

/** Nächste Frist (heute oder später) für einen Vertrag, sonst null */
export function nextDeadline<E extends Entry>(e: E, today = new Date()): Deadline<E> | null {
  if (e.status === 'cancelled' || !e.start_date) return null;
  if (!isKfz(e) && !isCourtage(e.sub_category)) return null;
  const t = startOfDay(today);
  const start = startOfDay(new Date(`${e.start_date}T00:00:00`));

  let deadline: Date;
  let renewal: Date;
  if (isKfz(e)) {
    let y = t.getFullYear();
    if (t > new Date(y, 10, 30)) y += 1;
    deadline = new Date(y, 10, 30);
    renewal = new Date(y + 1, 0, 1);
  } else {
    // nächster Jahrestag, dessen Kündigungsfrist noch nicht vorbei ist
    renewal = addYears(start, Math.max(1, t.getFullYear() - start.getFullYear()));
    while (addMonths(renewal, -3) < t) renewal = addYears(renewal, 1);
    deadline = addMonths(renewal, -3);
  }
  // Vertrag muss vor dem Ablauf schon laufen
  if (start >= renewal) return null;

  const daysLeft = differenceInCalendarDays(deadline, t);
  return { entry: e, kind: isKfz(e) ? 'kfz' : 'renewal', deadline, renewal, daysLeft, due: daysLeft <= REMIND_DAYS, key: `${e.id}|${format(deadline, 'yyyy-MM-dd')}` };
}

export function upcomingDeadlines<E extends Entry>(entries: E[], today = new Date()): Deadline<E>[] {
  return entries
    .map((e) => nextDeadline(e, today))
    .filter((d): d is Deadline<E> => !!d && d.daysLeft <= LOOKAHEAD_DAYS)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

export const deadlineTopic = (d: Deadline) =>
  d.kind === 'kfz'
    ? `KFZ-Wechselstichtag ${format(d.deadline, 'dd.MM.yyyy')}: Tarif prüfen${d.entry.policy_number ? ` (Schein ${d.entry.policy_number})` : ''}`
    : `${d.entry.sub_category} läuft am ${format(d.renewal, 'dd.MM.yyyy')} ab, Kündigungsfrist ${format(d.deadline, 'dd.MM.yyyy')}${d.entry.policy_number ? ` (Schein ${d.entry.policy_number})` : ''}`;
