import React from 'react';
import { Loader2, type LucideIcon } from 'lucide-react';
import { cn } from '@/utils/cn';

/* ------------------------------------------------------------------ */
/* Button                                                              */
/* ------------------------------------------------------------------ */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  loading?: boolean;
}

const variantClass: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', icon: Icon, loading, className, children, disabled, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(variantClass[variant], size === 'sm' && 'btn-sm', className)}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon ? <Icon className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} /> : null}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';

export const IconButton = ({
  icon: Icon,
  label,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string }) => (
  <button type="button" aria-label={label} title={label} className={cn('btn-icon', className)} {...props}>
    <Icon className="h-[18px] w-[18px]" />
  </button>
);

/* ------------------------------------------------------------------ */
/* Card                                                                */
/* ------------------------------------------------------------------ */

export const Card = ({
  className,
  padded = true,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { padded?: boolean }) => (
  <div className={cn('card', padded && 'card-pad', className)} {...props} />
);

export const CardHeader = ({
  title,
  icon: Icon,
  action,
  description,
  className,
}: {
  title: React.ReactNode;
  icon?: LucideIcon;
  action?: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
}) => (
  <div className={cn('mb-4 flex items-start justify-between gap-3', className)}>
    <div className="min-w-0">
      <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
        {Icon && <Icon className="h-4 w-4 text-gray-400" />}
        {title}
      </h2>
      {description && <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{description}</p>}
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);

/* ------------------------------------------------------------------ */
/* Seitenkopf                                                          */
/* ------------------------------------------------------------------ */

export const PageHeader = ({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) => (
  <header className={cn('mb-6 sm:mb-8', className)}>
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white sm:text-[1.75rem] sm:leading-9">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
    {children && <div className="mt-5">{children}</div>}
  </header>
);

/* ------------------------------------------------------------------ */
/* Segmentierte Auswahl (Tabs)                                         */
/* ------------------------------------------------------------------ */

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = 'md',
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; icon?: LucideIcon; count?: number }[];
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div
      role="tablist"
      className={cn(
        'no-scrollbar inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg border border-gray-200 bg-gray-100/70 p-0.5 dark:border-gray-700 dark:bg-gray-950/40',
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-md font-medium transition-colors',
              size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm',
              active
                ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:text-white dark:ring-gray-700'
                : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white',
            )}
          >
            {Icon && <Icon className="h-3.5 w-3.5" />}
            {o.label}
            {typeof o.count === 'number' && o.count > 0 && (
              <span
                className={cn(
                  'tabular min-w-[1.25rem] rounded px-1 text-center text-2xs',
                  active ? 'bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-200' : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
                )}
              >
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Badge                                                               */
/* ------------------------------------------------------------------ */

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

const toneClass: Record<Tone, string> = {
  neutral: 'bg-gray-100 text-gray-700 dark:bg-gray-700/60 dark:text-gray-200',
  brand: 'bg-brand-50 text-brand-700 dark:bg-brand-900/60 dark:text-brand-200',
  success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  warning: 'bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  danger: 'bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  info: 'bg-sky-50 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
};

export const Badge = ({
  tone = 'neutral',
  icon: Icon,
  className,
  children,
}: {
  tone?: Tone;
  icon?: LucideIcon;
  className?: string;
  children: React.ReactNode;
}) => (
  <span className={cn('chip', toneClass[tone], className)}>
    {Icon && <Icon className="h-3 w-3" />}
    {children}
  </span>
);

/* ------------------------------------------------------------------ */
/* Leerer Zustand, Laden, Fehler                                       */
/* ------------------------------------------------------------------ */

export const EmptyState = ({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) => (
  <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
    {Icon && (
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-dashed border-gray-300 text-gray-400 dark:border-gray-600">
        <Icon className="h-5 w-5" />
      </div>
    )}
    <p className="text-sm font-medium text-gray-900 dark:text-white">{title}</p>
    {description && <p className="mt-1 max-w-sm text-sm text-gray-500 dark:text-gray-400">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export const Spinner = ({ className }: { className?: string }) => (
  <Loader2 className={cn('h-5 w-5 animate-spin text-brand-600 dark:text-brand-400', className)} />
);

export const PageLoading = ({ label = 'Wird geladen' }: { label?: string }) => (
  <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-live="polite">
    <div className="flex items-center gap-3 text-sm text-gray-500">
      <Spinner />
      {label}
    </div>
  </div>
);

/* ------------------------------------------------------------------ */
/* Avatar                                                              */
/* ------------------------------------------------------------------ */

const initials = (name?: string | null) =>
  (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

export const Avatar = ({
  name,
  src,
  size = 'md',
  className,
  ring,
}: {
  name?: string | null;
  src?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  ring?: boolean;
}) => {
  const sizes = {
    xs: 'h-6 w-6 text-2xs',
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-14 w-14 text-base',
    xl: 'h-24 w-24 text-2xl',
  };
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-100 font-semibold text-brand-800 dark:bg-brand-900 dark:text-brand-200',
        ring && 'ring-2 ring-white dark:ring-gray-800',
        sizes[size],
        className,
      )}
    >
      {src ? <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" /> : initials(name)}
    </span>
  );
};

/* ------------------------------------------------------------------ */
/* Formularfeld                                                        */
/* ------------------------------------------------------------------ */

export const Field = ({
  label,
  hint,
  children,
  className,
  htmlFor,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  htmlFor?: string;
}) => (
  <div className={className}>
    <label htmlFor={htmlFor} className="field-label">
      {label}
    </label>
    {children}
    {hint && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{hint}</p>}
  </div>
);

/* ------------------------------------------------------------------ */
/* Fortschrittslinie (Lineal)                                          */
/* ------------------------------------------------------------------ */

export const GoalRuler = ({
  value,
  goal,
  expected,
  className,
}: {
  value: number;
  goal: number;
  /** Wo man heute laut Kalender stehen müsste (0–1) */
  expected?: number;
  className?: string;
}) => {
  const pct = goal > 0 ? Math.min(value / goal, 1) : 0;
  return (
    <div className={cn('relative h-3', className)} aria-hidden>
      {/* Skala */}
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-gray-200 dark:bg-gray-700" />
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <span
          key={t}
          className="absolute top-0 h-3 w-px bg-gray-300 dark:bg-gray-600"
          style={{ left: `calc(${t * 100}% - ${t === 1 ? 1 : 0}px)` }}
        />
      ))}
      {/* Erreicht */}
      <div
        className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-brand-600 transition-[width] duration-700 ease-out dark:bg-brand-400"
        style={{ width: `${pct * 100}%` }}
      />
      {/* Soll heute */}
      {typeof expected === 'number' && (
        <span
          className="absolute -top-0.5 h-4 w-0.5 rounded bg-amber-400"
          style={{ left: `${Math.min(Math.max(expected, 0), 1) * 100}%` }}
        />
      )}
    </div>
  );
};
