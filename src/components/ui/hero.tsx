import React from 'react';
import { cn } from '@/utils/cn';
import { useCountUp, useMounted } from '@/lib/useCountUp';

/* ------------------------------------------------------------------ */
/* Kopffeld: dunkles Petrol mit warmem Licht und feinem Raster         */
/* ------------------------------------------------------------------ */

export const HeroPanel = ({
  className,
  children,
  glow = 'right',
  ...props
}: React.HTMLAttributes<HTMLElement> & { glow?: 'right' | 'left' | 'none' }) => (
  <section
    className={cn(
      'relative isolate overflow-hidden rounded-3xl bg-brand-900 text-white shadow-[0_30px_60px_-30px_rgba(7,34,35,0.8)] dark:bg-brand-950 dark:ring-1 dark:ring-brand-800/60',
      className,
    )}
    {...props}
  >
    {glow !== 'none' && (
      <>
        <div
          aria-hidden
          className={cn('pointer-events-none absolute -top-32 -z-10 h-[30rem] w-[30rem] rounded-full', glow === 'right' ? '-right-24' : '-left-24')}
          style={{ background: 'radial-gradient(closest-side, rgba(242,165,65,0.28), rgba(242,165,65,0.07) 55%, transparent)' }}
        />
        <div
          aria-hidden
          className={cn('pointer-events-none absolute -bottom-40 -z-10 h-[26rem] w-[26rem] rounded-full', glow === 'right' ? '-left-24' : '-right-24')}
          style={{ background: 'radial-gradient(closest-side, rgba(63,156,151,0.35), transparent)' }}
        />
      </>
    )}
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 opacity-[0.045]"
      style={{ backgroundImage: 'linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)', backgroundSize: '32px 32px' }}
    />
    {children}
  </section>
);

/** Trennlinie innerhalb eines HeroPanel */
export const HeroDivider = ({ className }: { className?: string }) => <div className={cn('border-t border-white/10', className)} />;

/* ------------------------------------------------------------------ */
/* Große, hochzählende Kennzahl                                        */
/* ------------------------------------------------------------------ */

const int = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
const dec = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const CountUp = ({ value, format = 'int', className }: { value: number; format?: 'int' | 'eur' | 'dec'; className?: string }) => {
  const v = useCountUp(value);
  const text = format === 'int' ? int.format(Math.round(v)) : dec.format(v) + (format === 'eur' ? ' €' : '');
  return <span className={cn('tabular', className)}>{text}</span>;
};

/** Große Zahl im Kopffeld; bei Euro werden die Cent kleiner gesetzt. */
export const HeroNumber = ({
  value,
  format = 'int',
  label,
  unit,
  size = 'xl',
  accent,
  className,
}: {
  value: number;
  format?: 'int' | 'eur';
  label?: React.ReactNode;
  unit?: React.ReactNode;
  size?: 'lg' | 'xl';
  accent?: boolean;
  className?: string;
}) => {
  const v = useCountUp(value);
  const big = size === 'xl' ? 'text-6xl sm:text-7xl' : 'text-4xl sm:text-5xl';
  const small = size === 'xl' ? 'text-3xl sm:text-4xl' : 'text-xl sm:text-2xl';
  let main: string;
  let rest: React.ReactNode = null;
  if (format === 'eur') {
    const [e, c] = dec.format(v).split(',');
    main = e;
    rest = <span className={cn(small, 'text-brand-200')}>,{c} €</span>;
  } else {
    main = int.format(Math.round(v));
  }
  return (
    <div className={className}>
      {label && <p className="text-sm text-brand-200">{label}</p>}
      <p
        className={cn('tabular mt-1.5 font-display font-semibold leading-[0.9] tracking-tight', accent ? 'text-amber-300' : 'text-white')}
        aria-label={format === 'eur' ? `${dec.format(value)} Euro` : int.format(value)}
      >
        <span className={big}>{main}</span>
        {rest}
        {unit && <span className={cn(small, 'ml-1.5 text-brand-200')}>{unit}</span>}
      </p>
    </div>
  );
};

/** Kleine Kennzahl für Reihen im Kopffeld */
export const HeroStat = ({ label, value, hint, accent, className }: { label: React.ReactNode; value: React.ReactNode; hint?: React.ReactNode; accent?: boolean; className?: string }) => (
  <div className={className}>
    <dt className="text-xs text-brand-200">{label}</dt>
    <dd className={cn('tabular mt-1 font-display text-2xl font-semibold leading-tight', accent ? 'text-amber-300' : 'text-white')}>{value}</dd>
    {hint && <dd className="mt-0.5 text-xs text-brand-200/80">{hint}</dd>}
  </div>
);

/** Kleiner Umschalter im Kopffeld */
export function HeroToggle<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: [T, string][]; label: string }) {
  return (
    <div className="flex gap-0.5 rounded-lg bg-white/5 p-0.5" role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={cn(
            'rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300',
            value === v ? 'bg-white text-brand-900' : 'text-brand-100 hover:text-white',
          )}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Bogen-Tacho (Zielerreichung)                                        */
/* ------------------------------------------------------------------ */

const R = 84;
const ARC = `M ${100 - R} 100 A ${R} ${R} 0 0 1 ${100 + R} 100`;
const pointAt = (f: number, r = R) => {
  const a = Math.PI - Math.PI * f;
  return { x: 100 + r * Math.cos(a), y: 100 - r * Math.sin(a) };
};

export const GoalGauge = ({
  pct,
  expected,
  caption = 'vom Ziel',
  className,
}: {
  pct: number;
  /** Soll laut Kalender (0–1) als weißer Strich */
  expected?: number | null;
  caption?: string;
  className?: string;
}) => {
  const mounted = useMounted();
  const shown = useCountUp(pct, 1400);
  const reached = pct >= 100;
  const fill = Math.min(Math.max(pct, 0), 100);
  const id = React.useId().replace(/:/g, '');
  const tickIn = expected != null ? pointAt(Math.min(expected, 1), R - 13) : null;
  const tickOut = expected != null ? pointAt(Math.min(expected, 1), R + 13) : null;

  return (
    <div className={cn('relative mx-auto w-full max-w-[17rem]', className)}>
      <svg viewBox="0 0 200 112" className="w-full overflow-visible" role="img" aria-label={`${pct} % ${caption}`}>
        <defs>
          <linearGradient id={`g-${id}`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor={reached ? '#34D399' : '#F9D59C'} />
            <stop offset="100%" stopColor={reached ? '#10B981' : '#F2A541'} />
          </linearGradient>
          <filter id={`f-${id}`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <path d={ARC} fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth="14" strokeLinecap="round" />
        <path
          d={ARC}
          fill="none"
          stroke={`url(#g-${id})`}
          strokeWidth="14"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray="100 100"
          strokeDashoffset={mounted ? 100 - fill : 100}
          filter={`url(#f-${id})`}
          className="motion-safe:transition-[stroke-dashoffset] motion-safe:duration-[1400ms] motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)]"
        />
        {tickIn && tickOut && (
          <g>
            <line x1={tickIn.x} y1={tickIn.y} x2={tickOut.x} y2={tickOut.y} stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.85" />
            <title>Soll laut Kalender heute</title>
          </g>
        )}
      </svg>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 text-center">
        <p className="tabular font-display text-5xl font-semibold leading-none tracking-tight">
          {Math.round(shown)}<span className="text-2xl text-brand-200"> %</span>
        </p>
        <p className="mt-1 text-xs text-brand-200">{caption}</p>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Balken, die einmal nacheinander hereinwachsen                       */
/* ------------------------------------------------------------------ */

export type HeroBar = { key: string; label: string; value: number; display: string; current?: boolean; muted?: boolean };

export const HeroBars = ({ bars, className, height = 'h-32' }: { bars: HeroBar[]; className?: string; height?: string }) => {
  const mounted = useMounted();
  const max = Math.max(...bars.map((b) => b.value), 1);
  return (
    <ol className={cn('grid items-end gap-1.5 pt-6 sm:gap-2', height, className)} style={{ gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` }}>
      {bars.map((b, i) => {
        const h = b.value > 0 ? `${Math.max((b.value / max) * 100, 4)}%` : '2px';
        return (
          <li key={b.key} className="group relative flex h-full flex-col justify-end" title={`${b.label}: ${b.display}`}>
            <span className="relative flex flex-1 items-end">
              <span
                className={cn(
                  'relative block w-full rounded-t-[4px] motion-safe:transition-[height] motion-safe:duration-700 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)]',
                  b.current ? 'bg-gradient-to-t from-amber-500 to-amber-300 shadow-[0_0_28px_rgba(242,165,65,0.55)]' : b.muted ? 'bg-white/10' : 'bg-brand-300/75 group-hover:bg-brand-200',
                )}
                style={{ height: mounted ? h : '2px', transitionDelay: `${i * 45}ms` }}
              >
                <span
                  className={cn(
                    'tabular pointer-events-none absolute -top-1.5 left-1/2 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md px-1.5 py-0.5 text-2xs font-semibold shadow',
                    b.current && b.value > 0 ? 'block bg-amber-300 text-brand-950' : 'hidden bg-white text-brand-900 group-hover:block',
                  )}
                >
                  {b.display}
                </span>
              </span>
            </span>
            <span className={cn('mt-1.5 truncate text-center text-2xs', b.current ? 'font-semibold text-amber-300' : 'text-brand-200/80')}>{b.label}</span>
            <span className="sr-only">{b.display}</span>
          </li>
        );
      })}
    </ol>
  );
};

/* ------------------------------------------------------------------ */
/* Pillen, Etiketten, Gruppenkopf                                      */
/* ------------------------------------------------------------------ */

export type PillTone = 'sky' | 'emerald' | 'red' | 'amber' | 'gray' | 'brand' | 'violet';

const pillTone: Record<PillTone, string> = {
  sky: 'bg-sky-50 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  red: 'bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  amber: 'bg-amber-50 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  gray: 'bg-gray-100 text-gray-700 dark:bg-gray-700/60 dark:text-gray-200',
  brand: 'bg-brand-50 text-brand-700 dark:bg-brand-900/60 dark:text-brand-200',
  violet: 'bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-300',
};

/** Status als runde Pille mit Punkt */
export const StatusPill = ({ tone = 'gray', children, className, pulse }: { tone?: PillTone; children: React.ReactNode; className?: string; pulse?: boolean }) => (
  <span className={cn('inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium', pillTone[tone], className)}>
    <span className="relative flex h-1.5 w-1.5">
      {pulse && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60 motion-reduce:hidden" />}
      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
    </span>
    {children}
  </span>
);

/** Farbiges Etikett (z. B. Sparte, Kategorie) */
export const Tag = ({ color, children, className }: { color: string; children: React.ReactNode; className?: string }) => (
  <span className={cn('inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs font-medium text-gray-800 dark:text-gray-100', className)} style={{ background: `${color}26` }}>
    <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
    {children}
  </span>
);

/** Kopf einer Gruppe in einer Liste; bleibt beim Scrollen unter der Kopfleiste stehen. */
export const GroupHeader = ({ title, meta, aside, className }: { title: React.ReactNode; meta?: React.ReactNode; aside?: React.ReactNode; className?: string }) => (
  <div
    className={cn(
      'sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-10 flex items-baseline justify-between gap-3 border-b border-gray-200 bg-gray-50 px-4 py-2.5 dark:border-gray-700 dark:bg-gray-900 sm:px-6',
      className,
    )}
  >
    <span className="min-w-0 truncate">
      <span className="font-display text-base font-semibold text-gray-900 dark:text-white">{title}</span>
      {meta && <span className="tabular ml-2 text-xs text-gray-500">{meta}</span>}
    </span>
    {aside && <span className="tabular shrink-0 text-sm font-semibold text-gray-900 dark:text-white">{aside}</span>}
  </div>
);

/** Farbstreifen links an einer Listenzeile (Elternelement braucht `relative group`). */
export const RowStripe = ({ color, className }: { color: string; className?: string }) => (
  <span aria-hidden className={cn('absolute inset-y-2.5 left-0 w-1 rounded-r transition-all group-hover:inset-y-1.5 group-hover:w-1.5', className)} style={{ background: color }} />
);
