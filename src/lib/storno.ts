// Storno-Gründe und Auswertung

export const CANCEL_REASONS = ['Widerruf', 'Kündigung durch Kunde', 'Nichtzahlung', 'Umdeckung zu anderem Anbieter', 'Vertrag ersetzt (eigener Neuvertrag)', 'Sonstiges'];

type Row = { category: string; status: string; cancel_reason?: string | null };

export type StornoStats = {
  total: number;
  cancelled: number;
  rate: number;
  byCategory: { id: string; total: number; cancelled: number; rate: number }[];
  byReason: { reason: string; count: number }[];
};

export function stornoStats(rows: Row[], categories: string[]): StornoStats {
  const cancelled = rows.filter((r) => r.status === 'cancelled');
  const byCategory = categories
    .map((id) => {
      const all = rows.filter((r) => r.category === id);
      const c = all.filter((r) => r.status === 'cancelled').length;
      return { id, total: all.length, cancelled: c, rate: all.length ? (c / all.length) * 100 : 0 };
    })
    .filter((c) => c.total > 0);
  const reasons = new Map<string, number>();
  cancelled.forEach((r) => {
    const k = r.cancel_reason || 'Ohne Angabe';
    reasons.set(k, (reasons.get(k) || 0) + 1);
  });
  return {
    total: rows.length,
    cancelled: cancelled.length,
    rate: rows.length ? (cancelled.length / rows.length) * 100 : 0,
    byCategory,
    byReason: [...reasons.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
  };
}
