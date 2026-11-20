import { cn } from '@/utils/cn';
import { CATEGORY_COLORS } from '@/lib/chartTheme';

const eur0 = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

export type CategoryTile = { id: string; label: string; icon?: string; amount: number; count: number };

type Props = {
  tiles: CategoryTile[];
  value: string;
  onChange: (id: string) => void;
};

/** Sparten mit Anteil an der Provision; ein Klick filtert die Vertragsliste. */
export const CategoryTiles = ({ tiles, value, onChange }: Props) => {
  const total = tiles.reduce((a, t) => a + t.amount, 0);
  return (
    <div role="group" aria-label="Nach Sparte filtern" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-3 sm:px-0 lg:grid-cols-6">
      {tiles.map((t) => {
        const selected = value === t.id;
        const share = total ? (t.amount / total) * 100 : 0;
        const color = CATEGORY_COLORS[t.id] || '#9AA39C';
        return (
          <button
            key={t.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(selected ? 'all' : t.id)}
            className={cn(
              'group relative min-w-[9.5rem] shrink-0 overflow-hidden rounded-xl border bg-white p-3.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 dark:bg-gray-800',
              selected ? 'border-gray-900 dark:border-gray-200' : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600',
              t.count === 0 && !selected && 'opacity-60',
            )}
          >
            <span className="flex items-center justify-between gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
                {t.label}
              </span>
              <span className="tabular text-xs font-normal text-gray-400">{t.count}</span>
            </span>
            <span className="tabular mt-2 block font-display text-xl font-semibold text-gray-900 dark:text-white">{eur0.format(t.amount)}</span>
            <span className="mt-2 block h-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
              <span className="block h-full rounded-full" style={{ width: `${share}%`, background: color }} />
            </span>
            <span className="tabular mt-1 block text-2xs text-gray-400">{Math.round(share)} % der Provision</span>
          </button>
        );
      })}
    </div>
  );
};
