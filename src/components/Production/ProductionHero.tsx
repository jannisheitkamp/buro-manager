import { useState } from 'react';
import { cn } from '@/utils/cn';

const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const eur0 = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const num = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });

export type HeroMonth = { key: string; label: string; commission: number; lifeValues: number; current: boolean; future: boolean };

type Props = {
  periodLabel: string;
  totalCommission: number;
  totalLifeValues: number;
  lifeValuesGoal: number;
  lifeValuesNote?: string;
  months: HeroMonth[];
  contractCount: number;
  cancelledCount: number;
};

/** Kopf der Produktionsseite: Jahresprovision, Lebenswerte gegen Ziel und der Verlauf über die Monate. */
export const ProductionHero = ({
  periodLabel, totalCommission, totalLifeValues, lifeValuesGoal, lifeValuesNote, months,
  contractCount, cancelledCount,
}: Props) => {
  const [mode, setMode] = useState<'commission' | 'lifeValues'>('commission');
  const values = months.map((m) => (mode === 'commission' ? m.commission : m.lifeValues));
  const max = Math.max(...values, 1);
  const goalPct = lifeValuesGoal ? Math.round((totalLifeValues / lifeValuesGoal) * 100) : null;
  const [euros, cents] = eur.format(totalCommission).replace(/\s?€$/, '').split(',');

  return (
    <section
      aria-label={`Produktion ${periodLabel}`}
      className="relative overflow-hidden rounded-3xl bg-brand-900 text-white shadow-[0_24px_48px_-28px_rgba(7,34,35,0.7)] dark:bg-brand-950 dark:ring-1 dark:ring-brand-800/60"
    >
      {/* feines Raster wie auf der Anmeldeseite */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.045]"
        style={{ backgroundImage: 'linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)', backgroundSize: '32px 32px' }}
      />
      <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[1fr_auto]">
        <div>
          <p className="text-sm text-brand-200">Provision {periodLabel}</p>
          <p className="tabular mt-1 font-display font-semibold leading-none tracking-tight">
            <span className="text-5xl sm:text-6xl">{euros}</span>
            <span className="text-2xl text-brand-200 sm:text-3xl">,{cents} €</span>
          </p>
          <p className="mt-3 text-sm text-brand-100/80">
            {contractCount} {contractCount === 1 ? 'Vertrag' : 'Verträge'}
            {cancelledCount > 0 && <span className="text-brand-200/70">, dazu {cancelledCount} storniert</span>}
          </p>
        </div>

        <div className="min-w-[15rem] lg:border-l lg:border-white/10 lg:pl-8">
          <p className="text-sm text-brand-200">Lebenswerte</p>
          <p className="tabular mt-1 font-display text-4xl font-semibold leading-none text-amber-300">{num.format(totalLifeValues)}</p>
          {lifeValuesGoal > 0 ? (
            <div className="mt-4">
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className={cn('h-full rounded-full', goalPct! >= 100 ? 'bg-emerald-400' : 'bg-amber-300')} style={{ width: `${Math.min(goalPct!, 100)}%` }} />
              </div>
              <p className="tabular mt-1.5 flex justify-between text-xs text-brand-200">
                <span>{goalPct} % vom Ziel</span>
                <span>Ziel {num.format(lifeValuesGoal)}</span>
              </p>
            </div>
          ) : (
            <p className="mt-2 text-xs text-brand-200/70">Kein Ziel hinterlegt</p>
          )}
          {lifeValuesNote && <p className="mt-1 text-xs text-brand-200/70">{lifeValuesNote}</p>}
        </div>
      </div>

      {/* Monatsverlauf */}
      <div className="relative border-t border-white/10 px-6 pb-5 pt-4 sm:px-8">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-xs text-brand-200">Verlauf nach Einreichung</p>
          <div className="flex gap-0.5 rounded-lg bg-white/5 p-0.5" role="group" aria-label="Wert im Verlauf">
            {([['commission', 'Provision'], ['lifeValues', 'Lebenswerte']] as const).map(([v, label]) => (
              <button
                key={v}
                type="button"
                aria-pressed={mode === v}
                onClick={() => setMode(v)}
                className={cn('rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300', mode === v ? 'bg-white text-brand-900' : 'text-brand-100 hover:text-white')}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <ol className="grid h-28 items-end gap-1.5 sm:gap-2" style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}>
          {months.map((m, i) => {
            const v = values[i];
            const label = mode === 'commission' ? eur0.format(v) : `${num.format(v)} LW`;
            return (
              <li key={m.key} className="group relative flex h-full flex-col justify-end" title={`${m.label}: ${label}`}>
                <span className="tabular pointer-events-none absolute -top-1 left-1/2 hidden -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-white px-1.5 py-0.5 text-2xs font-medium text-brand-900 shadow group-hover:block">
                  {label}
                </span>
                <span
                  className={cn(
                    'block w-full rounded-t-[3px] transition-[height] duration-500',
                    m.current ? 'bg-amber-300' : m.future ? 'bg-white/10' : 'bg-brand-300/80 group-hover:bg-brand-200',
                  )}
                  style={{ height: v > 0 ? `${Math.max((v / max) * 100, 4)}%` : '2px' }}
                />
                <span className={cn('mt-1.5 text-center text-2xs', m.current ? 'font-semibold text-amber-300' : 'text-brand-200/80')}>{m.label}</span>
                <span className="sr-only">{label}</span>
              </li>
            );
          })}
        </ol>
      </div>

    </section>
  );
};
