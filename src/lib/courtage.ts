// Sach-Courtage: wird je Rate (Zahlweise) verdient und gesammelt zum 31.12. ausgezahlt.

// Sparten mit laufender Courtage je Zahlweise (keine Stornohaftung)
export const COURTAGE_SUBCATEGORIES = ['PHV', 'HR', 'UNF', 'Sach', 'KFZ', 'Rechtsschutz', 'Sonstige'];

const MONTHS_PER_RATE: Record<string, number> = { monthly: 1, quarterly: 3, half_yearly: 6, yearly: 12 };

export const isCourtage = (subCategory?: string | null) => !!subCategory && COURTAGE_SUBCATEGORIES.includes(subCategory);

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

type CourtageEntry = {
  start_date: string | null;
  payment_method: string | null;
  commission_amount: number | null;
  commission_received_date: string | null;
};

/** Courtage-Jahr eines Vertrags: das Jahr des Vertragsbeginns. */
export const courtageYear = (e: { start_date: string | null; submission_date?: string | null }) =>
  Number(String(e.start_date || e.submission_date || '').slice(0, 4)) || null;

export type CourtageSummary = {
  /** Noch nicht ausgezahlt */
  open: number;
  /** Davon bis heute schon verdient (Raten fällig) */
  earned: number;
  /** Davon bis Jahresende noch fällig */
  upcoming: number;
  /** Bereits als erhalten markiert */
  received: number;
  /** Offene Courtage je Monat (12 Werte) */
  byMonth: number[];
  openCount: number;
};

export function summarizeCourtage(entries: CourtageEntry[], year: number, today = new Date()): CourtageSummary {
  const byMonth = Array(12).fill(0) as number[];
  let open = 0, earned = 0, received = 0, openCount = 0;
  const currentMonth = year < today.getFullYear() ? 11 : year > today.getFullYear() ? -1 : today.getMonth();

  for (const e of entries) {
    const amount = Number(e.commission_amount || 0);
    if (e.commission_received_date) {
      received += amount;
      continue;
    }
    const months = courtageRateMonths(e.start_date, e.payment_method);
    const perRate = months.length ? amount / months.length : 0;
    open += amount;
    openCount++;
    for (const m of months) {
      byMonth[m] += perRate;
      if (m <= currentMonth) earned += perRate;
    }
  }
  return { open, earned, upcoming: open - earned, received, byMonth, openCount };
}
