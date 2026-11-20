import { differenceInCalendarDays } from 'date-fns';
import { CalendarClock, CheckCheck } from 'lucide-react';
import { cn } from '@/utils/cn';
import type { CourtageSummary } from '@/lib/courtage';
import { useCountUp, useMounted } from '@/lib/useCountUp';

const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const MONTH_NAMES = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

type Props = {
  year: number;
  summary: CourtageSummary;
  active: boolean;
  onToggleContracts: () => void;
  onMarkAllReceived: () => void;
  marking?: boolean;
  loading?: boolean;
};

/** Sach-Courtage des Jahres: was offen ist, was davon schon verdient ist und wann ausgezahlt wird. */
export const CourtagePanel = ({ year, summary, active, onToggleContracts, onMarkAllReceived, marking, loading }: Props) => {
  const today = new Date();
  const payout = new Date(year, 11, 31);
  const daysLeft = differenceInCalendarDays(payout, today);
  const currentMonth = year < today.getFullYear() ? 12 : year > today.getFullYear() ? -1 : today.getMonth();
  const max = Math.max(...summary.byMonth, 0.01);
  const earnedPct = summary.open ? (summary.earned / summary.open) * 100 : 0;
  const nothing = summary.open === 0 && summary.received === 0;
  const shownOpen = useCountUp(summary.open);
  const mounted = useMounted();

  return (
    <section aria-labelledby="courtage-title" className="card flex flex-col p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="courtage-title" className="text-base font-semibold text-gray-900 dark:text-white">Courtage {year}</h2>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
            <CalendarClock className="h-3.5 w-3.5" />
            {daysLeft > 0 ? <>Auszahlung am 31.12., in {daysLeft} {daysLeft === 1 ? 'Tag' : 'Tagen'}</> : daysLeft === 0 ? 'Auszahlung heute' : 'Auszahlung war am 31.12.'}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="mt-6 space-y-3" aria-hidden>
          <div className="h-9 w-40 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-700/60" />
          <div className="h-2.5 animate-pulse rounded-full bg-gray-100 dark:bg-gray-700/60" />
        </div>
      ) : nothing ? (
        <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">
          Noch keine Sachverträge mit Beginn in {year}. Sobald du einen erfasst, siehst du hier die gesammelte Courtage bis zum 31.12.
        </p>
      ) : (
        <>
          <p className="mt-5 text-sm text-gray-500 dark:text-gray-400">Noch offen</p>
          <p className="tabular font-display text-4xl font-semibold leading-tight text-gray-900 dark:text-white">{eur.format(shownOpen)}</p>

          {/* verdient vs. folgt noch */}
          {summary.open > 0 && (
            <div className="mt-4">
              <div className="flex h-2.5 overflow-hidden rounded-full bg-amber-100 dark:bg-amber-900/30">
                <div className="h-full bg-amber-500 motion-safe:transition-[width] motion-safe:duration-[1100ms] motion-safe:ease-out" style={{ width: mounted ? `${earnedPct}%` : '0%' }} />
                <div
                  className="h-full flex-1"
                  style={{ backgroundImage: 'repeating-linear-gradient(135deg, rgba(224,138,30,0.45) 0 3px, transparent 3px 6px)' }}
                />
              </div>
              <dl className="tabular mt-2 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <dt className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400"><span className="h-2 w-2 rounded-sm bg-amber-500" />Schon verdient</dt>
                  <dd className="font-medium text-gray-900 dark:text-white">{eur.format(summary.earned)}</dd>
                </div>
                <div className="text-right">
                  <dt className="flex items-center justify-end gap-1.5 text-xs text-gray-500 dark:text-gray-400"><span className="h-2 w-2 rounded-sm border border-amber-500" />Kommt bis Dezember</dt>
                  <dd className="font-medium text-gray-900 dark:text-white">{eur.format(summary.upcoming)}</dd>
                </div>
              </dl>
            </div>
          )}

          {/* Raten je Monat bis zur Auszahlung */}
          <ol className="mt-5 mb-5 grid min-h-14 flex-1 grid-cols-12 items-end gap-1" aria-label="Offene Courtage je Monat">
            {summary.byMonth.map((v, i) => (
              <li key={i} className="flex h-full flex-col justify-end" title={`${MONTH_NAMES[i]}: ${eur.format(v)}`}>
                <span className="flex flex-1 items-end">
                <span
                  className={cn(
                    'block w-full rounded-[3px] motion-safe:transition-[height] motion-safe:duration-700',
                    v === 0 ? 'bg-gray-100 dark:bg-gray-700/60' : i <= currentMonth ? 'bg-amber-500' : 'border border-amber-500/70 bg-amber-50 dark:bg-amber-900/20',
                  )}
                  style={{ height: mounted && v > 0 ? `${Math.max((v / max) * 100, 12)}%` : '3px', transitionDelay: `${i * 40}ms` }}
                />
                </span>
                <span className={cn('mt-1 text-center text-2xs', i === 11 ? 'font-semibold text-amber-700 dark:text-amber-300' : 'text-gray-400')}>{MONTHS[i]}</span>
                <span className="sr-only">{MONTH_NAMES[i]}: {eur.format(v)}</span>
              </li>
            ))}
          </ol>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-4 text-sm dark:border-gray-700">
            <span className="text-gray-500 dark:text-gray-400">
              {summary.openCount} {summary.openCount === 1 ? 'Vertrag' : 'Verträge'} offen
              {summary.received > 0 && <>, {eur.format(summary.received)} erhalten</>}
            </span>
            {daysLeft < 0 && summary.openCount > 0 ? (
              <button type="button" onClick={onMarkAllReceived} disabled={marking} className="btn-secondary btn-sm">
                <CheckCheck className="h-3.5 w-3.5" /> Alle als erhalten markieren
              </button>
            ) : (
              <button type="button" onClick={onToggleContracts} aria-pressed={active} className={cn('btn-sm btn', active ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' : 'btn-ghost')}>
                {active ? 'Alle Verträge zeigen' : 'Diese Verträge zeigen'}
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
};
