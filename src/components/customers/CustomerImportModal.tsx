import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, FileSpreadsheet, Upload } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui';
import { Modal } from '@/components/Modal';
import { useProducts, productByName } from '@/lib/products';
import {
  IMPORT_FIELDS,
  guessMapping,
  matchProduct,
  parseCsv,
  planImport,
  readRows,
  toTable,
  type Cell,
  type ContractFields,
  type ImportPlan,
  type Mapping,
  type Table,
} from '@/lib/customerImport';
import { cn } from '@/utils/cn';
import type { Customer, Existing } from './shared';

type Step = 'file' | 'map' | 'preview' | 'done';
const SKIP = '__skip__';
const CHUNK = 200;

const chunks = <T,>(list: T[], n = CHUNK) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));

/** Kunden und Bestandsverträge aus CSV oder Excel übernehmen */
export function CustomerImportModal({
  isOpen,
  customers,
  existing,
  userId,
  canEdit,
  onClose,
  onDone,
}: {
  isOpen: boolean;
  customers: Customer[];
  existing: Existing[];
  userId: string | undefined;
  canEdit: (customerId: string) => boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const { products } = useProducts();
  const [step, setStep] = useState<Step>('file');
  const [fileName, setFileName] = useState('');
  const [table, setTable] = useState<Table | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [productMap, setProductMap] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ created: number; updated: number; contracts: number; failed: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep('file');
    setFileName('');
    setTable(null);
    setMapping(null);
    setProductMap({});
    setResult(null);
  };
  const close = () => {
    if (running) return;
    reset();
    onClose();
  };

  const readFile = async (file: File) => {
    try {
      let raw: Cell[][];
      if (/\.xlsx$/i.test(file.name)) {
        const { readSheet } = await import('read-excel-file/browser');
        raw = (await readSheet(file)) as unknown as Cell[][];
      } else if (/\.(csv|txt)$/i.test(file.name)) {
        const buf = await file.arrayBuffer();
        // Excel speichert CSV oft als Windows-1252; fehlerhafte UTF-8-Zeichen verraten das
        let txt = new TextDecoder('utf-8').decode(buf);
        if (txt.includes('�')) txt = new TextDecoder('windows-1252').decode(buf);
        raw = parseCsv(txt);
      } else {
        return toast.error('Bitte eine .xlsx- oder .csv-Datei wählen. Alte .xls-Dateien vorher in Excel als .xlsx speichern.');
      }
      const t = toTable(raw);
      if (t.rows.length === 0) return toast.error('In der Datei stehen keine Daten unter der Überschrift.');
      setFileName(file.name);
      setTable(t);
      setMapping(guessMapping(t.headers));
      setStep('map');
    } catch {
      toast.error('Datei konnte nicht gelesen werden.');
    }
  };

  const rows = useMemo(() => (table && mapping ? readRows(table, mapping) : []), [table, mapping]);

  // Produktwerte aus der Datei mit Vorschlag aus dem Katalog
  const productValues = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => r.contract && m.set(r.contract.product, (m.get(r.contract.product) || 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count, guess: matchProduct(value, products)?.name || null }));
  }, [rows, products]);
  const productFor = (value: string) => {
    const chosen = productMap[value];
    if (chosen === SKIP) return null;
    return chosen || productValues.find((p) => p.value === value)?.guess || null;
  };

  const plan: ImportPlan | null = useMemo(
    () => (step === 'preview' || step === 'map' ? planImport(rows, customers, existing, productFor, canEdit) : null),
    // productFor hängt nur an productMap und productValues
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, customers, existing, productMap, productValues, canEdit, step],
  );

  const run = async () => {
    if (!plan || !userId) return;
    setRunning(true);
    const contractRow = (customerId: string, c: ContractFields) => ({
      customer_id: customerId,
      created_by: userId,
      sub_category: c.product,
      category: productByName(c.product)?.area || 'other',
      insurer: c.insurer,
      policy_number: c.policy_number,
      start_date: c.start_date,
      premium: c.premium,
    });
    let created = 0;
    let updated = 0;
    let failed = 0;
    const contracts: ReturnType<typeof contractRow>[] = [];

    // 1. Neue Kunden; die Datenbank liefert ids und Namensschlüssel zurück
    for (const part of chunks(plan.create)) {
      const { data, error } = await supabase
        .from('customers')
        .insert(part.map((c) => ({ ...c.customer, customer_type: 'person', created_by: userId })))
        .select('id, name_key');
      if (error || !data) {
        failed += part.length;
        continue;
      }
      created += data.length;
      const idByKey = new Map((data as { id: string; name_key: string }[]).map((d) => [d.name_key, d.id]));
      part.forEach((c) => {
        const id = idByKey.get(c.key);
        if (id) c.contracts.forEach((x) => contracts.push(contractRow(id, x)));
      });
    }

    // 2. Vorhandene Kunden ergänzen
    for (const part of chunks(plan.update, 10)) {
      await Promise.all(
        part.map(async (u) => {
          if (Object.keys(u.patch).length) {
            const { error } = await supabase.from('customers').update(u.patch).eq('id', u.id);
            if (error) failed++;
            else updated++;
          }
          u.contracts.forEach((x) => contracts.push(contractRow(u.id, x)));
        }),
      );
    }

    // 3. Bestandsverträge
    let contractCount = 0;
    for (const part of chunks(contracts)) {
      const { error } = await supabase.from('customer_contracts').insert(part);
      if (error) failed += part.length;
      else contractCount += part.length;
    }

    setRunning(false);
    setResult({ created, updated, contracts: contractCount, failed });
    setStep('done');
    onDone();
  };

  const mappedLast = mapping && (mapping.last_name >= 0 || mapping.full_name >= 0);
  const sample = table?.rows.slice(0, 3) || [];

  return (
    <Modal isOpen={isOpen} onClose={close} title="Kunden importieren" description={fileName || 'Excel (.xlsx) oder CSV, eine Zeile pro Vertrag oder pro Kunde'} size="2xl">
      {step === 'file' && (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) readFile(f);
            }}
            className="flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-gray-300 px-6 py-12 text-center transition-colors hover:border-brand-400 hover:bg-brand-50/40 dark:border-gray-600 dark:hover:bg-white/[0.03]"
          >
            <FileSpreadsheet className="h-10 w-10 text-brand-600" />
            <span className="font-semibold text-gray-900 dark:text-white">Datei wählen oder hierher ziehen</span>
            <span className="text-sm text-gray-500">Die erste Zeile muss die Spaltenüberschriften enthalten. Die Zuordnung machst du im nächsten Schritt.</span>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) readFile(f);
              e.target.value = '';
            }}
          />
          <ul className="space-y-1 text-xs text-gray-500">
            <li>• Mehrere Zeilen mit gleichem Namen werden ein Kunde mit mehreren Verträgen.</li>
            <li>• Gibt es den Kunden schon, werden nur leere Felder ergänzt. Vorhandene Daten bleiben stehen.</li>
            <li>• Verträge landen als Bestandsverträge in der Kundenakte und zählen nicht zur Produktion.</li>
          </ul>
        </div>
      )}

      {step === 'map' && table && mapping && plan && (
        <div className="space-y-5">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Spalten zuordnen</h3>
            <p className="text-xs text-gray-500">{table.rows.length} Zeilen gefunden. Erkannte Spalten sind schon eingetragen.</p>
          </div>
          {(['customer', 'contract'] as const).map((group) => (
            <fieldset key={group} className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
              <legend className="px-1 text-sm font-semibold text-gray-700 dark:text-gray-200">{group === 'customer' ? 'Kunde' : 'Vertrag (optional)'}</legend>
              <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
                {IMPORT_FIELDS.filter((f) => f.group === group).map((f) => {
                  const idx = mapping[f.id];
                  const example = idx >= 0 ? sample.map((r) => r[idx]).find((v) => v != null && String(v).trim() !== '') : undefined;
                  return (
                    <label key={f.id} className="grid grid-cols-[9rem_1fr] items-center gap-2 text-sm">
                      <span className="text-gray-700 dark:text-gray-200">
                        {f.label}
                        {'required' in f && f.required && <span className="text-red-500"> *</span>}
                      </span>
                      <span className="min-w-0">
                        <select value={idx} onChange={(e) => setMapping({ ...mapping, [f.id]: Number(e.target.value) })} className={cn('input py-1.5', idx >= 0 && 'border-brand-300 dark:border-brand-700')}>
                          <option value={-1}>– nicht importieren –</option>
                          {table.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                        </select>
                        {example !== undefined && <span className="mt-0.5 block truncate text-2xs text-gray-400">z. B. {example instanceof Date ? example.toLocaleDateString('de-DE') : String(example)}</span>}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}

          {productValues.length > 0 && (
            <fieldset className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
              <legend className="px-1 text-sm font-semibold text-gray-700 dark:text-gray-200">Sparten aus der Datei</legend>
              <p className="mb-2 text-xs text-gray-500">Jeder Wert wird einem Produkt aus dem Katalog zugeordnet. Prüf vor allem die gelb markierten.</p>
              <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
                {productValues.map((p) => {
                  const current = productMap[p.value] || p.guess || SKIP;
                  return (
                    <div key={p.value} className="grid grid-cols-[1fr_1fr] items-center gap-2 text-sm">
                      <span className={cn('truncate', !p.guess && !productMap[p.value] && 'text-amber-700 dark:text-amber-300')}>
                        {p.value} <span className="text-xs text-gray-400">×{p.count}</span>
                      </span>
                      <select value={current} onChange={(e) => setProductMap({ ...productMap, [p.value]: e.target.value })} className={cn('input py-1.5', current === SKIP && 'border-amber-300')}>
                        <option value={SKIP}>– Vertrag weglassen –</option>
                        {products.filter((x) => x.active).map((x) => <option key={x.id} value={x.name}>{x.name}</option>)}
                      </select>
                    </div>
                  );
                })}
              </div>
            </fieldset>
          )}

          <div className="flex items-center justify-between gap-2">
            <Button variant="ghost" icon={ArrowLeft} onClick={reset}>Andere Datei</Button>
            <Button disabled={!mappedLast} onClick={() => setStep('preview')}>Weiter zur Vorschau</Button>
          </div>
          {!mappedLast && <p className="text-right text-xs text-red-600">Bitte „Nachname / Firma“ oder „Name komplett“ zuordnen.</p>}
        </div>
      )}

      {step === 'preview' && plan && (
        <div className="space-y-5">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Neue Kunden', value: plan.create.length, tone: 'text-brand-700 dark:text-brand-300' },
              { label: 'Ergänzt', value: plan.update.length, tone: 'text-sky-700 dark:text-sky-300' },
              { label: 'Bestandsverträge', value: plan.create.reduce((a, c) => a + c.contracts.length, 0) + plan.update.reduce((a, u) => a + u.contracts.length, 0), tone: 'text-gray-900 dark:text-white' },
              { label: 'Unverändert', value: plan.skipped.length + plan.unchanged, tone: 'text-gray-500' },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-gray-200 px-4 py-3 dark:border-gray-700">
                <dt className="text-xs text-gray-500">{s.label}</dt>
                <dd className={cn('tabular font-display text-2xl font-semibold', s.tone)}>{s.value}</dd>
              </div>
            ))}
          </dl>

          {plan.create.length + plan.update.length === 0 && (
            <p className="rounded-xl border border-gray-200 px-4 py-6 text-center text-sm text-gray-600 dark:border-gray-700 dark:text-gray-300">Nichts zu tun: Alle Kunden und Verträge aus der Datei sind schon eingetragen.</p>
          )}
          <div className={cn('max-h-72 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700', plan.create.length + plan.update.length === 0 && 'hidden')}>
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
                <tr className="text-left text-xs text-gray-500 [&>th]:px-3 [&>th]:py-2 [&>th]:font-medium">
                  <th>Kunde</th>
                  <th>Aktion</th>
                  <th>Verträge</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/70">
                {plan.create.slice(0, 100).map((c) => (
                  <tr key={c.key} className="[&>td]:px-3 [&>td]:py-1.5">
                    <td className="font-medium text-gray-900 dark:text-white">{c.customer.last_name}{c.customer.first_name ? `, ${c.customer.first_name}` : ''}</td>
                    <td><span className="text-xs font-semibold text-brand-700 dark:text-brand-300">neu</span></td>
                    <td className="text-gray-600 dark:text-gray-300">{c.contracts.map((x) => x.product).join(', ') || '–'}</td>
                  </tr>
                ))}
                {plan.update.slice(0, 100).map((u) => (
                  <tr key={u.id} className="[&>td]:px-3 [&>td]:py-1.5">
                    <td className="font-medium text-gray-900 dark:text-white">{u.name}</td>
                    <td><span className="text-xs font-semibold text-sky-700 dark:text-sky-300">ergänzt{Object.keys(u.patch).length ? ` (${Object.keys(u.patch).length} Felder)` : ''}</span></td>
                    <td className="text-gray-600 dark:text-gray-300">{u.contracts.map((x) => x.product).join(', ') || '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {plan.create.length + plan.update.length > 200 && <p className="px-3 py-2 text-xs text-gray-500">Vorschau zeigt die ersten Einträge.</p>}
          </div>

          {(plan.skipped.length > 0 || plan.warnings.length > 0) && (
            <details className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm dark:border-amber-800 dark:bg-amber-900/20">
              <summary className="flex cursor-pointer items-center gap-2 font-medium text-amber-800 dark:text-amber-200">
                <AlertTriangle className="h-4 w-4" /> {plan.skipped.length} übersprungen, {plan.warnings.length} Hinweise
              </summary>
              <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto text-xs text-gray-700 dark:text-gray-300">
                {plan.skipped.map((s, i) => <li key={`s${i}`}>Zeile {s.line}: übersprungen, {s.reason}</li>)}
                {plan.warnings.map((w, i) => <li key={`w${i}`}>Zeile {w.line}: {w.text}</li>)}
              </ul>
            </details>
          )}

          <div className="flex items-center justify-between gap-2">
            <Button variant="ghost" icon={ArrowLeft} onClick={() => setStep('map')} disabled={running}>Zurück</Button>
            <Button icon={Upload} loading={running} disabled={plan.create.length + plan.update.length === 0} onClick={run}>
              Jetzt importieren
            </Button>
          </div>
        </div>
      )}

      {step === 'done' && result && (
        <div className="space-y-4 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
          <p className="font-display text-xl font-semibold text-gray-900 dark:text-white">Import abgeschlossen</p>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {result.created} neue Kunden, {result.updated} ergänzt, {result.contracts} Bestandsverträge.
            {result.failed > 0 && <span className="block text-red-600">{result.failed} Einträge konnten nicht gespeichert werden.</span>}
          </p>
          <Button onClick={close}>Fertig</Button>
        </div>
      )}
    </Modal>
  );
}
