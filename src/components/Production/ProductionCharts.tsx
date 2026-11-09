import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Segmented } from '@/components/ui';
import { CHART, CATEGORY_COLORS, tooltipStyle } from '@/lib/chartTheme';

const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const num = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat('de-DE', { notation: 'compact', maximumFractionDigits: 1 });

type Props = {
  chartMode: 'revenue' | 'life_values';
  setChartMode: (mode: 'revenue' | 'life_values') => void;
  monthlyData: { name: string; value: number; lifeValues: number }[];
  categoryData: { id: string; name: string; value: number }[];
};

export const ProductionCharts = ({ chartMode, setChartMode, monthlyData, categoryData }: Props) => {
  const key = chartMode === 'revenue' ? 'value' : 'lifeValues';
  const fmt = chartMode === 'revenue' ? (v: number) => eur.format(v) : (v: number) => `${num.format(v)} LW`;
  const total = categoryData.reduce((a, c) => a + c.value, 0);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="card card-pad lg:col-span-2">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Letzte 6 Monate</h2>
          <Segmented
            size="sm"
            value={chartMode}
            onChange={setChartMode}
            options={[
              { value: 'revenue', label: 'Provision' },
              { value: 'life_values', label: 'Lebenswerte' },
            ]}
          />
        </div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyData} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: CHART.tick, fontSize: 12 }} dy={8} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: CHART.tick, fontSize: 12 }} tickFormatter={(v) => compact.format(v)} width={48} />
              <Tooltip cursor={{ fill: 'rgba(20, 106, 104, 0.06)' }} contentStyle={tooltipStyle} formatter={(v: number) => [fmt(v), chartMode === 'revenue' ? 'Provision' : 'Lebenswerte']} />
              <Bar dataKey={key} fill={CHART.primary} radius={[4, 4, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card card-pad">
        <h2 className="mb-5 text-base font-semibold text-gray-900 dark:text-white">Provision nach Sparte</h2>
        {categoryData.length === 0 ? (
          <p className="text-sm text-gray-500">Noch keine Verträge in dieser Auswahl.</p>
        ) : (
          <>
            {/* Gestapelter Balken statt Donut: Anteile sind direkt vergleichbar */}
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
              {categoryData.map((c) => (
                <div key={c.id} style={{ width: `${total ? (c.value / total) * 100 : 0}%`, background: CATEGORY_COLORS[c.id] || CHART.tick }} title={c.name} />
              ))}
            </div>
            <ul className="mt-5 space-y-3">
              {categoryData.map((c) => (
                <li key={c.id} className="flex items-center gap-3 text-sm">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: CATEGORY_COLORS[c.id] || CHART.tick }} />
                  <span className="flex-1 text-gray-700 dark:text-gray-300">{c.name}</span>
                  <span className="tabular text-xs text-gray-400">{total ? Math.round((c.value / total) * 100) : 0} %</span>
                  <span className="tabular w-24 text-right font-medium text-gray-900 dark:text-white">{eur.format(c.value)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
};
