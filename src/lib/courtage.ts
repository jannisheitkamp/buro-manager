// Sach-Courtage: wird je Rate (Zahlweise) verdient und gesammelt zum 31.12. ausgezahlt.
// Sachverträge laufen weiter, also gibt es auch in den Folgejahren Courtage, bis zum Storno.

import { isCourtageProduct } from '@/lib/products';

const MONTHS_PER_RATE: Record<string, number> = { monthly: 1, quarterly: 3, half_yearly: 6, yearly: 12 };

/** Produkte mit laufender Courtage je Zahlweise (keine Stornohaftung), laut Produktkatalog */
export const isCourtage = (subCategory?: string | null) => isCourtageProduct(subCategory);

/** Monate (0 = Januar), in denen ab Vertragsbeginn bis Dezember eine Rate fällig wird. Ohne Beginn: ganzes Jahr. */
export function courtageRateMonths(startDate: string | null | undefined, paymentMethod: string | null | undefined): number[] {
  const start = startDate ? Number(startDate.slice(5, 7)) - 1 : 0;
  const first = Number.isNaN(start) || start < 0 || start > 11 ? 0 : start;
  if (paymentMethod === 'one_time') return [first];
  const step = MONTHS_PER_RATE[paymentMethod || 'monthly'] ?? 1;
  const months: number[] = [];
  for (let m = first; m <= 11; m += step) months.push(m);
  return months;
}

/** Anzahl der Raten vom Vertragsbeginn bis einschließlich Dezember desselben Jahres. */
export const courtageInstallments = (startDate: string | null | undefined, paymentMethod: string | null | undefined) =>
  courtageRateMonths(startDate, paymentMethod).length;

export type CourtageEntry = {
  id: string;
  status: string;
  sub_category: string | null;
  start_date: string | null;
  submission_date?: string | null;
  payment_method: string | null;
  net_premium: number | null;
  commission_rate: number | null;
  commission_amount: number | null;
  cancelled_at?: string | null;
};

export type CourtagePayout = { entry_id: string; year: number; received_date: string };

/** Jahr des Vertragsbeginns */
export const courtageYear = (e: { start_date: string | null; submission_date?: string | null }) =>
  Number(String(e.start_date || e.submission_date || '').slice(0, 4)) || null;

/**
 * Monate eines Jahres, in denen für den Vertrag eine Rate fällig wird.
 * Erstes Jahr ab Beginn, Folgejahre im Rhythmus der Zahlweise, nach einem Storno keine Raten mehr.
 */
export function courtageMonthsInYear(e: CourtageEntry, year: number): number[] {
  if (!isCourtage(e.sub_category)) return [];
  const startYear = courtageYear(e);
  if (!startYear || year < startYear) return [];
  // Storniert ohne Datum: wie bisher gar keine Courtage
  if (e.status === 'cancelled' && !e.cancelled_at) return [];
  if (e.payment_method === 'one_time' && year > startYear) return [];

  const startMonth = Math.min(Math.max(Number(String(e.start_date || e.submission_date || '').slice(5, 7)) - 1 || 0, 0), 11);
  const step = MONTHS_PER_RATE[e.payment_method || 'monthly'] ?? 1;
  let months: number[];
  if (year === startYear) months = courtageRateMonths(e.start_date || e.submission_date, e.payment_method);
  else months = Array.from({ length: 12 }, (_, m) => m).filter((m) => (((m - startMonth) % step) + step) % step === 0);

  if (e.cancelled_at) {
    const cy = Number(e.cancelled_at.slice(0, 4));
    const cm = Number(e.cancelled_at.slice(5, 7)) - 1;
    if (year > cy) return [];
    if (year === cy) months = months.filter((m) => m < cm);
  }
  return months;
}

/** Courtage je Rate. Fällt auf den gespeicherten Betrag zurück, wenn Beitrag oder Satz fehlen. */
export function courtagePerRate(e: CourtageEntry): number {
  const net = Number(e.net_premium || 0);
  const rate = Number(e.commission_rate || 0);
  if (net && rate) return (net * rate) / 100;
  const first = courtageInstallments(e.start_date || e.submission_date, e.payment_method);
  return first ? Number(e.commission_amount || 0) / first : 0;
}

/** Courtage eines Vertrags in einem Jahr */
export const courtageForYear = (e: CourtageEntry, year: number) => courtagePerRate(e) * courtageMonthsInYear(e, year).length;

export type CourtageSummary = {
  /** Noch nicht ausgezahlt */
  open: number;
  /** Davon bis heute schon verdient (Raten fällig) */
  earned: number;
  /** Davon bis Jahresende noch fällig */
  upcoming: number;
  /** Bereits als erhalten markiert */
  received: number;
  /** Davon aus Verträgen früherer Jahre */
  fromRenewals: number;
  /** Offene Courtage je Monat (12 Werte) */
  byMonth: number[];
  openCount: number;
  /** Verträge mit offener Courtage in diesem Jahr */
  openIds: string[];
};

export function summarizeCourtage(entries: CourtageEntry[], payouts: CourtagePayout[], year: number, today = new Date()): CourtageSummary {
  const paid = new Set(payouts.filter((p) => p.year === year).map((p) => p.entry_id));
  const byMonth = Array(12).fill(0) as number[];
  let open = 0, earned = 0, received = 0, fromRenewals = 0;
  const openIds: string[] = [];
  const currentMonth = year < today.getFullYear() ? 11 : year > today.getFullYear() ? -1 : today.getMonth();

  for (const e of entries) {
    const months = courtageMonthsInYear(e, year);
    if (months.length === 0) continue;
    const perRate = courtagePerRate(e);
    const amount = perRate * months.length;
    if (paid.has(e.id)) {
      received += amount;
      continue;
    }
    open += amount;
    openIds.push(e.id);
    if ((courtageYear(e) || year) < year) fromRenewals += amount;
    for (const m of months) {
      byMonth[m] += perRate;
      if (m <= currentMonth) earned += perRate;
    }
  }
  return { open, earned, upcoming: open - earned, received, fromRenewals, byMonth, openCount: openIds.length, openIds };
}
