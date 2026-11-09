import { startOfWeek } from 'date-fns';
import { isHoliday } from '@/utils/dateUtils';

// Fester Empfangsplan. Änderungen hier gelten für alle Geräte gleichzeitig.
export type ReceptionPerson = 'Flori' | 'Lucas' | 'Jannis' | 'Marcio';

export const RECEPTION_WEEKDAYS: Record<number, ReceptionPerson> = {
  2: 'Lucas',
  3: 'Flori',
  4: 'Jannis',
  5: 'Lucas',
};

// Montags wechseln sich Jannis und Flori ab. Startwoche: Montag, 31.08.2026 = Jannis
const MONDAY_ROTATION: ReceptionPerson[] = ['Jannis', 'Flori'];
const MONDAY_REFERENCE = new Date(2026, 7, 31);

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;

export const isOfficeClosed = (d: Date) => isWeekend(d) || isHoliday(d);

export const getReceptionAssignee = (day: Date): ReceptionPerson | null => {
  if (isOfficeClosed(day)) return null;
  const dow = day.getDay();
  if (dow === 1) {
    const monday = startOfWeek(day, { weekStartsOn: 1 });
    const weeks = Math.round((monday.getTime() - MONDAY_REFERENCE.getTime()) / WEEK_MS);
    const idx = ((weeks % MONDAY_ROTATION.length) + MONDAY_ROTATION.length) % MONDAY_ROTATION.length;
    return MONDAY_ROTATION[idx];
  }
  return RECEPTION_WEEKDAYS[dow] || null;
};

/** Passt der Vorname aus dem Plan zu einem Profilnamen? */
export const matchesPerson = (fullName: string | null | undefined, person: string) =>
  !!fullName && fullName.toLowerCase().split(/\s+/).includes(person.toLowerCase());
