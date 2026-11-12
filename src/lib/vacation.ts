import { parseISO } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { getVacationDaysToDeduct } from '@/utils/dateUtils';
import type { Absence, Profile } from '@/types';

type VacationRow = Pick<Absence, 'type' | 'status' | 'start_date' | 'end_date' | 'deduct_vacation_days' | 'used_days' | 'half_day'>;

/**
 * Urlaubstage, die im Jahr `year` abgezogen werden (genehmigt + offen).
 * Urlaube über den Jahreswechsel zählen nur mit dem Teil, der im Jahr liegt.
 * Manuell gesetzte Tage (used_days) gehen vor.
 */
export const vacationDaysUsedInYear = (absences: VacationRow[], year: number, profile?: Partial<Profile> | null) =>
  absences
    .filter((a) => a.type === 'vacation' && a.status !== 'rejected' && (a.deduct_vacation_days ?? true))
    .reduce((sum, a) => {
      let start = parseISO(a.start_date);
      let end = parseISO(a.end_date);
      if (end.getFullYear() < year || start.getFullYear() > year) return sum;
      if (start.getFullYear() < year) start = new Date(year, 0, 1);
      if (end.getFullYear() > year) end = new Date(year, 11, 31);
      const days = a.used_days ?? getVacationDaysToDeduct(start, end, profile ?? undefined, a.half_day);
      return sum + Number(days);
    }, 0);

/** Übertrag aus dem Vorjahr für ein Jahr (0, wenn keiner eingetragen ist). */
export const fetchCarryover = async (userId: string, year: number) => {
  const { data } = await supabase
    .from('vacation_carryover')
    .select('days')
    .eq('user_id', userId)
    .eq('year', year)
    .maybeSingle();
  return Number(data?.days) || 0;
};
