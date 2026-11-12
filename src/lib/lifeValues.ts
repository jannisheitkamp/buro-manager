import { supabase } from '@/lib/supabase';

/** Offizieller Lebenswerte-Stand laut Monatsliste: Summe Januar bis Ende `month` (yyyy-MM-01). */
export type LvSnapshot = { user_id: string; month: string; ytd_lv: number };

type LvEntry = { user_id: string; submission_date: string | null; status?: string | null; life_values?: number | string | null };

export const fetchLvSnapshots = async (year: number, userId?: string) => {
  let q = supabase
    .from('production_lv_snapshots')
    .select('user_id, month, ytd_lv')
    .gte('month', `${year}-01-01`)
    .lte('month', `${year}-12-01`);
  if (userId) q = q.eq('user_id', userId);
  const { data } = await q;
  return ((data || []) as LvSnapshot[]).map((s) => ({ ...s, ytd_lv: Number(s.ytd_lv) }));
};

/** Lebenswerte pro Monat (Index 0 = Januar) nur aus den erfassten Verträgen, ohne Stornos. */
export const computedMonthlyLv = (entries: LvEntry[], userId: string, year: number) => {
  const months = Array(12).fill(0) as number[];
  for (const e of entries) {
    if (e.user_id !== userId || e.status === 'cancelled' || !e.submission_date) continue;
    const [y, m] = e.submission_date.split('-').map(Number);
    if (y === year && m >= 1 && m <= 12) months[m - 1] += Number(e.life_values || 0);
  }
  return months;
};

/**
 * Lebenswerte pro Monat mit Korrektur durch die Monatslisten.
 * Gibt es für einen Monat einen Stand, gilt er als Jahressumme bis dahin; danach wird
 * mit den erfassten Verträgen weitergezählt. So stimmen Ziel und Rangliste mit der Liste überein.
 */
export const correctedMonthlyLv = (entries: LvEntry[], snapshots: LvSnapshot[], userId: string, year: number) => {
  const computed = computedMonthlyLv(entries, userId, year);
  const byMonth = new Map(
    snapshots
      .filter((s) => s.user_id === userId && s.month.startsWith(`${year}-`))
      .map((s) => [Number(s.month.slice(5, 7)) - 1, s.ytd_lv]),
  );
  const monthly: number[] = [];
  let cum = 0;
  for (let i = 0; i < 12; i++) {
    const next = byMonth.has(i) ? byMonth.get(i)! : cum + computed[i];
    monthly.push(next - cum);
    cum = next;
  }
  return monthly;
};

/** Summe Januar bis einschließlich `untilMonth` (0 = Januar). */
export const sumUntil = (monthly: number[], untilMonth = 11) => monthly.slice(0, untilMonth + 1).reduce((a, b) => a + b, 0);
