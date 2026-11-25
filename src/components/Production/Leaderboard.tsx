import { useState } from 'react';
import { format } from 'date-fns';
import { Trophy } from 'lucide-react';
import { Avatar, EmptyState } from '@/components/ui';
import { correctedMonthlyLv, sumUntil, type LvSnapshot } from '@/lib/lifeValues';
import { formatCurrency } from '@/lib/productionExport';
import { cn } from '@/utils/cn';

type Person = { id: string; full_name: string; monthly_goal?: number | null; yearly_goal?: number | null };
type Row = {
  user_id: string;
  status: string;
  submission_date: string;
  commission_amount: number | null;
  life_values: number | null;
  profiles?: { full_name?: string | null; avatar_url?: string | null } | null;
};

/** Rangliste nach Provision, mit Zielerreichung nach Lebenswerten */
export function Leaderboard({ entries, profiles, snapshots, year, userId }: { entries: Row[]; profiles: Person[]; snapshots: LvSnapshot[]; year: number; userId: string | undefined }) {
  const [boardPeriod, setBoardPeriod] = useState<'month' | 'year' | 'all'>('month');
  const user = { id: userId };

  // Zeitraum wählbar; Zielerreichung nach Lebenswerten gegen das eigene Monats- bzw. Jahresziel
  const leaderboardData = (() => {
      const prefix = boardPeriod === 'month' ? format(new Date(), 'yyyy-MM') : boardPeriod === 'year' ? format(new Date(), 'yyyy') : '';
      const userTotals: Record<string, { name: string; avatar: string | undefined; amount: number; lv: number; count: number }> = {};

      entries.filter(e => e.status !== 'cancelled' && String(e.submission_date || '').startsWith(prefix)).forEach(e => {
          const userId = e.user_id;
          if (!userTotals[userId]) {
              userTotals[userId] = {
                  name: e.profiles?.full_name || 'Unbekannt',
                  avatar: e.profiles?.avatar_url || undefined,
                  amount: 0,
                  lv: 0,
                  count: 0
              };
          }
          userTotals[userId].amount += Number(e.commission_amount || 0);
          userTotals[userId].lv += Number(e.life_values || 0);
          userTotals[userId].count += 1;
      });

      return Object.entries(userTotals)
        .map(([id, data]) => {
            const p = profiles.find(pr => pr.id === id);
            const monthly = Number(p?.monthly_goal) || 0;
            // Lebenswerte nach Monatsliste korrigiert (Monat bzw. Jahr bis heute)
            if (boardPeriod !== 'all') {
                const corrected = correctedMonthlyLv(entries, snapshots, id, year);
                data.lv = boardPeriod === 'month' ? corrected[new Date().getMonth()] : sumUntil(corrected);
            }
            const goal = boardPeriod === 'month' ? monthly : boardPeriod === 'year' ? Number(p?.yearly_goal) || monthly * 12 : 0;
            return { id, ...data, goal, goalPct: goal ? Math.round((data.lv / goal) * 100) : null };
        })
        .sort((a, b) => b.amount - a.amount);
  })();

  return (
    <div className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 dark:border-gray-700 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">Rangliste nach Provision</h2>
                <p className="text-sm text-gray-500">Eingereichte und policierte Verträge, ohne Stornos. Balken = Lebenswerte im Verhältnis zum eigenen Ziel.</p>
            </div>
            <div className="flex shrink-0 gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-800" role="group" aria-label="Zeitraum">
                {([['month', 'Monat'], ['year', 'Jahr'], ['all', 'Gesamt']] as const).map(([v, label]) => (
                    <button
                        key={v}
                        type="button"
                        onClick={() => setBoardPeriod(v)}
                        aria-pressed={boardPeriod === v}
                        className={cn('rounded-lg px-3 py-1 text-xs font-medium', boardPeriod === v ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white' : 'text-gray-500 hover:text-gray-900 dark:hover:text-white')}
                    >
                        {label}
                    </button>
                ))}
            </div>
        </div>
        {leaderboardData.length === 0 ? (
            <EmptyState icon={Trophy} title="Noch keine Verträge erfasst" />
        ) : (
            <ol className="divide-y divide-gray-100 dark:divide-gray-700/70">
                {leaderboardData.map((data, index) => (
                    <li key={data.id} className={cn('flex items-center gap-4 px-5 py-3.5 sm:px-6', data.id === user?.id && 'bg-brand-50/50 dark:bg-brand-900/20')}>
                        <span className={cn('tabular w-8 font-display text-xl font-semibold', index === 0 ? 'text-amber-500' : 'text-gray-300 dark:text-gray-600')}>{index + 1}</span>
                        <Avatar name={data.name} src={data.avatar} size="md" />
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{data.name}{data.id === user?.id && <span className="font-normal text-gray-400"> (du)</span>}</p>
                            <p className="text-xs text-gray-500">
                                {data.count} {data.count === 1 ? 'Vertrag' : 'Verträge'} · {new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(data.lv)} LW
                                {data.goalPct !== null && <> · <span className={cn(data.goalPct >= 100 && 'font-semibold text-emerald-700 dark:text-emerald-400')}>{data.goalPct} % vom Ziel</span></>}
                            </p>
                        </div>
                        <span className="tabular hidden text-sm font-semibold text-gray-900 dark:text-white sm:block">{formatCurrency(data.amount)}</span>
                        <div className="hidden w-40 sm:block">
                            <div className="h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                                <div
                                    className={cn('h-full rounded-full', data.goalPct !== null && data.goalPct >= 100 ? 'bg-emerald-500' : 'bg-brand-600 dark:bg-brand-400')}
                                    style={{ width: `${data.goalPct !== null ? Math.min(data.goalPct, 100) : leaderboardData[0].amount ? (data.amount / leaderboardData[0].amount) * 100 : 0}%` }}
                                />
                            </div>
                        </div>
                    </li>
                ))}
            </ol>
        )}
    </div>
  );
}
