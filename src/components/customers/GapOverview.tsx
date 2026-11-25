import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Download, FileDown, Phone, Search, ShieldAlert } from 'lucide-react';
import { Button, EmptyState } from '@/components/ui';
import { StatusPill } from '@/components/ui/hero';
import { csvText, downloadCsv } from '@/utils/csv';
import { cn } from '@/utils/cn';
import type { Customer, CustomerRow } from './shared';

type Person = { id: string; full_name: string };

/** Lücken über alle Kunden: filtern, Rückrufe in Serie anlegen, als Vertriebsliste exportieren */
export function GapOverview({
  rows,
  people,
  onOpen,
  onCallbacks,
}: {
  rows: CustomerRow[];
  people: Person[];
  onOpen: (id: string) => void;
  onCallbacks: (customers: Customer[], topic: string) => void;
}) {
  const [gap, setGap] = useState('');
  const [owner, setOwner] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const withGaps = useMemo(() => rows.filter((r) => r.gaps.length > 0), [rows]);
  const nameOf = (id: string | null) => (id ? people.find((p) => p.id === id)?.full_name || 'Unbekannt' : 'Ohne Betreuer');

  // Häufigste Lücken zuerst
  const gapCounts = useMemo(() => {
    const m = new Map<string, number>();
    withGaps.forEach((r) => r.gaps.forEach((g) => m.set(g, (m.get(g) || 0) + 1)));
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de'));
  }, [withGaps]);

  const owners = useMemo(() => {
    const ids = [...new Set(withGaps.map((r) => r.owner || ''))];
    return ids.map((id) => ({ id, name: nameOf(id || null) })).sort((a, b) => a.name.localeCompare(b.name, 'de'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withGaps, people]);

  const q = query.trim().toLowerCase();
  const visible = withGaps.filter(
    (r) =>
      (!gap || r.gaps.includes(gap)) &&
      (!owner || (r.owner || '') === owner) &&
      (!q || r.name.toLowerCase().includes(q) || r.customer.phone?.includes(q)),
  );
  const chosen = visible.filter((r) => selected.has(r.customer.id));
  const allChosen = visible.length > 0 && chosen.length === visible.length;

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleAll = () => setSelected(allChosen ? new Set() : new Set(visible.map((r) => r.customer.id)));

  const exportRows = (chosen.length ? chosen : visible).map((r) => ({
    name: r.name,
    phone: r.customer.phone || '',
    email: r.customer.email || '',
    owner: nameOf(r.owner),
    gaps: r.gaps.join(', '),
    has: [...r.active.map((e) => e.sub_category || e.category), ...r.existing.map((x) => x.sub_category)].join(', '),
  }));
  const title = `Lücken${gap ? ` ${gap}` : ''}${owner ? ` – ${nameOf(owner || null)}` : ''}`;
  const fileBase = `Luecken_${gap ? gap.replace(/[^\wäöüÄÖÜß-]+/g, '_') + '_' : ''}${format(new Date(), 'yyyy-MM-dd')}`;

  const exportCsv = () =>
    downloadCsv(
      `${fileBase}.csv`,
      ['Kunde', 'Telefon', 'E-Mail', 'Betreuer', 'Fehlt', 'Hat schon'],
      exportRows.map((r) => [r.name, r.phone, r.email, r.owner, r.gaps, r.has].map(csvText)),
    );

  const exportPdf = async () => {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(16);
    doc.text(title, 14, 18);
    doc.setFontSize(9);
    doc.setTextColor(110);
    doc.text(`${exportRows.length} Kunden · erstellt am ${format(new Date(), 'dd.MM.yyyy')}`, 14, 24);
    doc.setTextColor(0);
    autoTable(doc, {
      startY: 29,
      head: [['Kunde', 'Telefon', 'E-Mail', 'Betreuer', 'Fehlt', 'Hat schon']],
      body: exportRows.map((r) => [r.name, r.phone, r.email, r.owner, r.gaps, r.has]),
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 1.8 },
      headStyles: { fillColor: [20, 106, 104] },
      columnStyles: { 4: { cellWidth: 60 }, 5: { cellWidth: 60 } },
    });
    doc.save(`${fileBase}.pdf`);
  };

  if (withGaps.length === 0) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Keine offenen Lücken"
        description="Lücken erscheinen, sobald bei Kunden Lebenslage oder Verträge hinterlegt sind und eine Lückenregel passt."
      />
    );
  }

  return (
    <div>
      {/* Häufigste Lücken als Schnellfilter */}
      <div className="flex flex-wrap gap-1.5 border-b border-gray-100 px-4 py-3 dark:border-gray-700 sm:px-6">
        {gapCounts.map(([g, n]) => (
          <button
            key={g}
            type="button"
            aria-pressed={gap === g}
            onClick={() => setGap(gap === g ? '' : g)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors',
              gap === g
                ? 'border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-600 dark:bg-amber-900/30 dark:text-amber-200'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700/50',
            )}
          >
            {g} <span className="tabular text-gray-400">{n}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 border-b border-gray-100 px-4 py-3 dark:border-gray-700 sm:flex-row sm:items-center sm:px-6">
        <div className="relative sm:w-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input type="search" placeholder="Name oder Telefon" aria-label="Lückenliste durchsuchen" value={query} onChange={(e) => setQuery(e.target.value)} className="input pl-9" />
        </div>
        {owners.length > 1 && (
          <select aria-label="Betreuer" value={owner} onChange={(e) => setOwner(e.target.value)} className="input sm:w-48">
            <option value="">Alle Betreuer</option>
            {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        )}
        <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
          <Button size="sm" icon={Phone} disabled={chosen.length === 0} onClick={() => onCallbacks(chosen.map((r) => r.customer), gap ? `Lücke ${gap} besprechen` : 'Fehlende Absicherung besprechen')}>
            {chosen.length ? `${chosen.length} Rückruf${chosen.length > 1 ? 'e' : ''}` : 'Rückrufe'}
          </Button>
          <Button size="sm" variant="secondary" icon={Download} onClick={exportCsv} disabled={visible.length === 0}>CSV</Button>
          <Button size="sm" variant="secondary" icon={FileDown} onClick={exportPdf} disabled={visible.length === 0}>PDF</Button>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="px-6 py-6 text-sm text-gray-500">Kein Kunde passt zu diesem Filter.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-500 dark:border-gray-700 [&>th]:px-3 [&>th]:py-2 [&>th]:font-medium">
                <th className="w-10 !pl-4 sm:!pl-6">
                  <input type="checkbox" checked={allChosen} onChange={toggleAll} aria-label="Alle auswählen" className="rounded" />
                </th>
                <th>Kunde</th>
                <th>Fehlt</th>
                <th className="hidden md:table-cell">Betreuer</th>
                <th className="hidden sm:table-cell">Telefon</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/70">
              {visible.map((r) => (
                <tr key={r.customer.id} className={cn('[&>td]:px-3 [&>td]:py-2.5', selected.has(r.customer.id) && 'bg-brand-50/50 dark:bg-brand-900/20')}>
                  <td className="!pl-4 sm:!pl-6">
                    <input type="checkbox" checked={selected.has(r.customer.id)} onChange={() => toggle(r.customer.id)} aria-label={`${r.name} auswählen`} className="rounded" />
                  </td>
                  <td>
                    <button type="button" onClick={() => onOpen(r.customer.id)} className="font-semibold text-gray-900 hover:underline dark:text-white">{r.name}</button>
                    {r.callbacks.length > 0 && <StatusPill tone="sky" className="ml-2">Rückruf offen</StatusPill>}
                  </td>
                  <td>
                    <span className="flex flex-wrap gap-1">
                      {r.gaps.map((g) => (
                        <span key={g} className={cn('rounded-md border border-dashed px-1.5 py-0.5 text-xs font-medium', g === gap ? 'border-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200' : 'border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300')}>{g}</span>
                      ))}
                    </span>
                  </td>
                  <td className="hidden text-gray-600 dark:text-gray-300 md:table-cell">{nameOf(r.owner)}</td>
                  <td className="hidden whitespace-nowrap sm:table-cell">
                    {r.customer.phone ? <a href={`tel:${r.customer.phone.replace(/\s/g, '')}`} className="text-brand-700 hover:underline dark:text-brand-300">{r.customer.phone}</a> : <span className="text-gray-400">–</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
