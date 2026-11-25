// Vertragsfristen für Wiedervorlagen
// KFZ: Hauptfälligkeit 1.1., Wechselstichtag 30.11.
// Andere Sachverträge: Ablauf zum Jahrestag des Vertragsbeginns, Kündigungsfrist 3 Monate vorher.
// Sind Ablauf oder Hauptfälligkeit bekannt (Bestandsverträge), gelten diese statt des Beginns;
// KFZ dann mit einem Monat Frist.

import { addDays, addMonths, addYears, differenceInCalendarDays, format, startOfDay } from 'date-fns';
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
  /** Ablauf (erste Kündigungsmöglichkeit), falls bekannt */
  end_date?: string | null;
  /** Hauptfälligkeit, zählen nur Tag und Monat */
  main_due?: string | null;
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
  if (e.status === 'cancelled' || !(e.start_date || e.end_date || e.main_due)) return null;
  if (!isKfz(e) && !isCourtage(e.sub_category)) return null;
  const t = startOfDay(today);
  const day = (d: string) => startOfDay(new Date(`${d}T00:00:00`));
  const start = e.start_date ? day(e.start_date) : null;
  const kfz = isKfz(e);
  const known = !!(e.end_date || e.main_due);

  let deadline: Date;
  let renewal: Date;
  if (kfz && !known) {
    let y = t.getFullYear();
    if (t > new Date(y, 10, 30)) y += 1;
    deadline = new Date(y, 10, 30);
    renewal = new Date(y + 1, 0, 1);
  } else {
    // KFZ: Kündigung bis einen Tag vor einem Monat vor Fälligkeit (1.1. → 30.11.), sonst 3 Monate
    const cut = (r: Date) => (kfz ? addDays(addMonths(r, -1), -1) : addMonths(r, -3));
    const end = e.end_date ? day(e.end_date) : null;
    if (end && cut(end) >= t) {
      // vor dem Ablauf ist keine Kündigung möglich
      renewal = end;
    } else {
      // nächster Jahrestag (Hauptfälligkeit, sonst Ablauf oder Beginn), dessen Frist noch nicht vorbei ist
      const anchor = e.main_due ? day(e.main_due) : end || start!;
      renewal = addYears(anchor, t.getFullYear() - anchor.getFullYear() - 1);
      while (cut(renewal) < t || (start && renewal <= start)) renewal = addYears(renewal, 1);
    }
    deadline = cut(renewal);
  }
  // Vertrag muss vor dem Ablauf schon laufen
  if (start && start >= renewal) return null;

  const daysLeft = differenceInCalendarDays(deadline, t);
  return { entry: e, kind: kfz && !known ? 'kfz' : 'renewal', deadline, renewal, daysLeft, due: daysLeft <= REMIND_DAYS, key: `${e.id}|${format(deadline, 'yyyy-MM-dd')}` };
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
