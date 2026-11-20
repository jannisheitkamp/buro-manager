import { useState } from 'react';
import { cn } from '@/utils/cn';
import { useCountUp, useMounted } from '@/lib/useCountUp';
import { GoalGauge, HeroPanel } from '@/components/ui/hero';

const eur = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const eur0 = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const num = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });

export type HeroMonth = { key: string; label: string; commission: number; lifeValues: number; current: boolean; future: boolean };

type Props = {
  periodLabel: string;
  totalCommission: number;
  totalLifeValues: number;
  lifeValuesGoal: number;
  /** Wo man laut Kalender heute stehen müsste (0–1), sonst null */
  goalExpected: number | null;
  lifeValuesNote?: string;
  months: HeroMonth[];
  contractCount: number;
  cancelledCount: number;
};

/** Kopf der Produktionsseite: Jahresprovision, Lebenswerte gegen Ziel und der Verlauf über die Monate. */
export const ProductionHero = ({
  periodLabel, totalCommission, totalLifeValues, lifeValuesGoal, goalExpected, lifeValuesNote, months,
  contractCount, cancelledCount,
}: Props) => {
  const [mode, setMode] = useState<'commission' | 'lifeValues'>('commission');
  const mounted = useMounted();
  const shownCommission = useCountUp(totalCommission);
  const shownLv = useCountUp(totalLifeValues);
  const values = months.map((m) => (mode === 'commission' ? m.commission : m.lifeValues));
  const max = Math.max(...values, 1);
  const goalPct = lifeValuesGoal ? Math.round((totalLifeValues / lifeValuesGoal) * 100) : null;
  const [euros, cents] = eur.format(shownCommission).split(',');
  const behind = goalPct !== null && goalExpected !== null && goalPct < goalExpected * 100;

  return (
    <HeroPanel aria-label={`Produktion ${periodLabel}`}>
      <div className="grid items-center gap-8 p-6 sm:p-8 lg:grid-cols-[1fr_18rem]">
        <div>
          <p className="text-sm text-brand-200">Provision {periodLabel}</p>
          <p className="tabular mt-2 font-display font-semibold leading-[0.9] tracking-tight" aria-label={`${eur.format(totalCommission)} Euro`}>
            <span className="text-6xl sm:text-7xl">{euros}</span>
            <span className="text-3xl text-brand-200 sm:text-4xl">,{cents} €</span>
          </p>
          <p className="mt-4 text-sm text-brand-100/80">
            {contractCount} {contractCount === 1 ? 'Vertrag' : 'Verträge'}
            {cancelledCount > 0 && <span className="text-brand-200/70">, dazu {cancelledCount} storniert</span>}
          </p>
        </div>

        <div className="text-center">
          {goalPct !== null ? (
            <>
              <GoalGauge pct={goalPct} expected={goalExpected} caption="vom Jahresziel" />
              <p className="tabular mt-4 font-display text-2xl font-semibold text-amber-300">
                {num.format(shownLv)} <span className="font-sans text-sm font-normal text-brand-200">von {num.format(lifeValuesGoal)} LW</span>
              </p>
              {goalExpected !== null && goalPct < 100 && (
                <p className="mt-1 text-xs text-brand-200">
                  {behind
                    ? <>Für heute wären {Math.round(goalExpected * 100)} % fällig</>
                    : <>Vor dem Plan, Soll heute {Math.round(goalExpected * 100)} %</>}
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-sm text-brand-200">Lebenswerte</p>
              <p className="tabular mt-1 font-display text-5xl font-semibold text-amber-300">{num.format(shownLv)}</p>
              <p className="mt-2 text-xs text-brand-200/70">Kein Jahresziel für diese Auswahl</p>
            </>
          )}
          {lifeValuesNote && <p className="mt-1 text-xs text-brand-200/70">{lifeValuesNote}</p>}
        </div>
      </div>

      {/* Monatsverlauf */}
      <div className="border-t border-white/10 px-6 pb-5 pt-4 sm:px-8">
        <div className="mb-4 flex items-center justify-between gap-3">
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
        <ol className="grid h-32 items-end gap-1.5 pt-6 sm:gap-2" style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}>
          {months.map((m, i) => {
            const v = values[i];
            const label = mode === 'commission' ? eur0.format(v) : `${num.format(v)} LW`;
            const height = v > 0 ? `${Math.max((v / max) * 100, 4)}%` : '2px';
            return (
              <li key={m.key} className="group relative flex h-full flex-col justify-end" title={`${m.label}: ${label}`}>
                <span className="relative flex flex-1 items-end">
                  <span
                    className={cn(
                      'relative block w-full rounded-t-[4px] motion-safe:transition-[height] motion-safe:duration-700 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)]',
                      m.current
                        ? 'bg-gradient-to-t from-amber-500 to-amber-300 shadow-[0_0_28px_rgba(242,165,65,0.55)]'
                        : m.future ? 'bg-white/10' : 'bg-brand-300/75 group-hover:bg-brand-200',
                    )}
                    style={{ height: mounted ? height : '2px', transitionDelay: `${i * 45}ms` }}
                  >
                    <span
                      className={cn(
                        'tabular pointer-events-none absolute -top-1.5 left-1/2 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md px-1.5 py-0.5 text-2xs font-semibold shadow',
                        m.current && v > 0 ? 'block bg-amber-300 text-brand-950' : 'hidden bg-white text-brand-900 group-hover:block',
                      )}
                    >
                      {label}
                    </span>
                  </span>
                </span>
                <span className={cn('mt-1.5 text-center text-2xs', m.current ? 'font-semibold text-amber-300' : 'text-brand-200/80')}>{m.label}</span>
                <span className="sr-only">{label}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </HeroPanel>
  );
};
