import { useMemo, useState } from 'react';
import { EyeOff, Pencil, Plus, Search } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { AREAS, METHODS, areaOf, matchesProduct, methodOf, useProducts, type CalcMethod, type Product } from '@/lib/products';
import { GAP_GROUP_LABELS } from '@/lib/gaps';
import { Modal } from '@/components/Modal';
import { Button, Field } from '@/components/ui';
import { cn } from '@/utils/cn';

const nf = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 });
const parse = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));

type Props = {
  /** Eigene Sätze je Produktname */
  myRates: Record<string, number>;
  onSaved: (name: string, value: number | null) => void;
};

type EditState = { product: Product | null; name: string; area: string; calc_method: CalcMethod; default_rate: string; lv_factor: string; gap_group: string; aliases: string; active: boolean };

/** Alle Produkte mit Team-Standard und eigenem Satz; Admins pflegen den Katalog */
export const CommissionRates = ({ myRates, onSaved }: Props) => {
  const { user, profile } = useStore();
  const isAdmin = !!profile?.roles?.includes('admin');
  const { products, reload } = useProducts();
  const [query, setQuery] = useState('');
  const [area, setArea] = useState('all');
  const [onlyMine, setOnlyMine] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [edit, setEdit] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);

  const list = useMemo(
    () =>
      products
        .filter((p) => (showHidden ? true : p.active))
        .filter((p) => area === 'all' || p.area === area)
        .filter((p) => !query.trim() || matchesProduct(p, query))
        .filter((p) => !onlyMine || myRates[p.name] !== undefined)
        .sort((a, b) => AREAS.findIndex((x) => x.id === a.area) - AREAS.findIndex((x) => x.id === b.area) || a.name.localeCompare(b.name, 'de')),
    [products, area, query, onlyMine, showHidden, myRates],
  );

  const saveMine = async (p: Product) => {
    if (!user || drafts[p.name] === undefined) return;
    const value = parse(drafts[p.name]);
    if (value !== null && (Number.isNaN(value) || value < 0)) return toast.error('Bitte eine Zahl eintragen.');
    if (value === (myRates[p.name] ?? null)) return;
    // Alten Eintrag ersetzen (ältere Einträge können eine andere Sparte tragen)
    const { error: delError } = await supabase.from('user_commission_settings').delete().eq('user_id', user.id).eq('sub_category', p.name);
    const { error } =
      delError || value === null || value === p.default_rate
        ? { error: delError }
        : await supabase.from('user_commission_settings').insert({ user_id: user.id, category: p.area, sub_category: p.name, rate_value: value, updated_at: new Date().toISOString() });
    if (error) return toast.error('Satz konnte nicht gespeichert werden.');
    onSaved(p.name, value === null || value === p.default_rate ? null : value);
    setDrafts((d) => {
      const n = { ...d };
      delete n[p.name];
      return n;
    });
    toast.success(`${p.name}: gespeichert`);
  };

  const openEdit = (p: Product | null) =>
    setEdit({
      product: p,
      name: p?.name || query.trim(),
      area: p?.area || (area !== 'all' ? area : 'other'),
      calc_method: p?.calc_method || areaOf(area !== 'all' ? area : 'other').method,
      default_rate: p ? String(p.default_rate).replace('.', ',') : '',
      lv_factor: p ? String(p.lv_factor).replace('.', ',') : String(areaOf(area !== 'all' ? area : 'other').lv).replace('.', ','),
      gap_group: p?.gap_group || '',
      aliases: p?.aliases || '',
      active: p?.active ?? true,
    });

  const saveEdit = async () => {
    if (!edit || !user || !edit.name.trim()) return;
    const rate = parse(edit.default_rate) ?? 0;
    const lv = parse(edit.lv_factor) ?? 0;
    if ([rate, lv].some((n) => Number.isNaN(n) || n < 0)) return toast.error('Satz und Faktor bitte als Zahl eintragen.');
    const payload = { name: edit.name.trim(), area: edit.area, calc_method: edit.calc_method, default_rate: rate, lv_factor: lv, gap_group: edit.gap_group || null, aliases: edit.aliases.trim() || null, active: edit.active };
    setSaving(true);
    const { error } = edit.product
      ? await supabase.from('insurance_products').update(payload).eq('id', edit.product.id)
      : await supabase.from('insurance_products').insert({ ...payload, active: true, created_by: user.id });
    setSaving(false);
    if (error) return toast.error(error.code === '23505' ? 'Dieses Produkt gibt es schon.' : 'Produkt konnte nicht gespeichert werden.');
    toast.success(edit.product ? 'Produkt gespeichert' : 'Produkt angelegt, für alle sichtbar');
    setEdit(null);
    reload();
  };

  let lastArea = '';
  return (
    <section aria-labelledby="rates-title" className="card overflow-clip">
      <div className="flex flex-col gap-3 border-b border-gray-100 px-4 py-4 dark:border-gray-700 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="rates-title" className="font-display text-lg font-semibold text-gray-900 dark:text-white">
              Provisionssätze <span className="tabular ml-1 font-sans text-sm font-normal text-gray-400">{list.length} Produkte</span>
            </h2>
            <p className="text-xs text-gray-500">Leeres Feld bei „Mein Satz“ = Team-Standard. {isAdmin ? 'Als Admin legst du den Team-Standard fest.' : 'Den Team-Standard legt ein Admin fest.'}</p>
          </div>
          <Button icon={Plus} onClick={() => openEdit(null)}>Produkt hinzufügen</Button>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Produkt suchen, z. B. Musik, Riester, Hund" aria-label="Produkte durchsuchen" className="input pl-9" />
          </div>
          <select value={area} onChange={(e) => setArea(e.target.value)} className="input sm:w-56" aria-label="Bereich">
            <option value="all">Alle Bereiche</option>
            {AREAS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
          <label className="flex shrink-0 items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} className="rounded" /> Nur eigene Sätze
          </label>
          {isAdmin && (
            <label className="flex shrink-0 items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
              <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} className="rounded" /> Ausgeblendete
            </label>
          )}
        </div>
      </div>

      {list.length === 0 ? (
        <p className="px-6 py-8 text-center text-sm text-gray-500">
          Kein Produkt gefunden.{' '}
          <button type="button" onClick={() => openEdit(null)} className="font-medium text-brand-700 hover:underline dark:text-brand-300">„{query.trim() || 'Neues Produkt'}“ anlegen</button>
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-white dark:bg-gray-800">
              <tr className="border-b border-gray-100 text-left text-xs text-gray-500 dark:border-gray-700 [&>th]:px-4 [&>th]:py-2 [&>th]:font-medium sm:[&>th]:px-6">
                <th>Produkt</th>
                <th className="hidden md:table-cell">Berechnung</th>
                <th className="text-right">Team-Standard</th>
                <th className="w-36 text-right">Mein Satz</th>
                {isAdmin && <th className="w-12"><span className="sr-only">Bearbeiten</span></th>}
              </tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const m = methodOf(p.calc_method);
                const showArea = p.area !== lastArea;
                lastArea = p.area;
                const mine = myRates[p.name];
                return (
                  <FragmentRow key={p.id} header={showArea ? areaOf(p.area).label : null} color={areaOf(p.area).color} cols={isAdmin ? 5 : 4}>
                    <tr className={cn('border-b border-gray-50 dark:border-gray-700/50 [&>td]:px-4 [&>td]:py-1.5 sm:[&>td]:px-6', !p.active && 'opacity-50')}>
                      <td>
                        <span className="font-medium text-gray-900 dark:text-white">{p.name}</span>
                        {!p.active && <EyeOff className="ml-1.5 inline h-3.5 w-3.5 text-gray-400" aria-label="ausgeblendet" />}
                        <span className="block text-2xs text-gray-400 md:hidden">{m.label}</span>
                      </td>
                      <td className="hidden text-xs text-gray-500 md:table-cell" title={m.hint}>{m.label}</td>
                      <td className="tabular text-right text-gray-600 dark:text-gray-300">{nf.format(p.default_rate)} {m.unit}</td>
                      <td className="text-right">
                        <div className="relative ml-auto w-28">
                          <input
                            inputMode="decimal"
                            aria-label={`Mein Satz ${p.name}`}
                            placeholder={nf.format(p.default_rate)}
                            value={drafts[p.name] ?? (mine !== undefined ? String(mine).replace('.', ',') : '')}
                            onChange={(e) => setDrafts((d) => ({ ...d, [p.name]: e.target.value }))}
                            onBlur={() => saveMine(p)}
                            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                            className={cn('input tabular h-8 py-0 pr-9 text-right', mine !== undefined && 'border-brand-400 font-semibold dark:border-brand-500')}
                          />
                          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">{m.unit}</span>
                        </div>
                      </td>
                      {isAdmin && (
                        <td className="text-right">
                          <button type="button" onClick={() => openEdit(p)} className="btn-icon p-1.5" aria-label={`${p.name} bearbeiten`}>
                            <Pencil className="h-4 w-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  </FragmentRow>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={!!edit} onClose={() => setEdit(null)} title={edit?.product ? 'Produkt bearbeiten' : 'Produkt hinzufügen'} description={edit?.product ? 'Umbenennen ändert den Namen auch in allen Verträgen.' : 'Wird für das ganze Team in die Liste aufgenommen.'}>
        {edit && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Name" htmlFor="pe-name" className="sm:col-span-2">
                <input id="pe-name" autoFocus value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className="input" />
              </Field>
              <Field label="Bereich" htmlFor="pe-area">
                <select
                  id="pe-area"
                  value={edit.area}
                  onChange={(e) => {
                    const a = areaOf(e.target.value);
                    setEdit({ ...edit, area: a.id, ...(edit.product ? {} : { calc_method: a.method, lv_factor: String(a.lv).replace('.', ',') }) });
                  }}
                  className="input"
                >
                  {AREAS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              </Field>
              <Field label="Provision berechnen als" htmlFor="pe-method" hint={methodOf(edit.calc_method).hint}>
                <select id="pe-method" value={edit.calc_method} onChange={(e) => setEdit({ ...edit, calc_method: e.target.value as CalcMethod })} className="input">
                  {METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </Field>
              {isAdmin && (
                <Field label={`Team-Standard (${methodOf(edit.calc_method).unit})`} htmlFor="pe-rate">
                  <input id="pe-rate" inputMode="decimal" value={edit.default_rate} onChange={(e) => setEdit({ ...edit, default_rate: e.target.value })} className="input tabular" />
                </Field>
              )}
              {isAdmin && (
              <Field label="Faktor Lebenswerte" htmlFor="pe-lv">
                <input id="pe-lv" inputMode="decimal" value={edit.lv_factor} onChange={(e) => setEdit({ ...edit, lv_factor: e.target.value })} className="input tabular" />
              </Field>
              )}
              {isAdmin && (
              <Field label="Schließt Lücke" htmlFor="pe-gap" hint="z. B. Grundfähigkeit schließt die Lücke Arbeitskraft (BU)">
                <select id="pe-gap" value={edit.gap_group} onChange={(e) => setEdit({ ...edit, gap_group: e.target.value })} className="input">
                  <option value="">keine</option>
                  {Object.entries(GAP_GROUP_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </Field>
              )}
              <Field label="Suchbegriffe" htmlFor="pe-alias" hint="Weitere Wörter, unter denen man es findet">
                <input id="pe-alias" value={edit.aliases} onChange={(e) => setEdit({ ...edit, aliases: e.target.value })} className="input" />
              </Field>
            </div>
            {!isAdmin && <p className="text-xs text-gray-500">Team-Standard und Lebenswerte-Faktor kommen vom Bereich, ein Admin kann sie anpassen. Deinen eigenen Satz trägst du danach in der Liste ein.</p>}
            {edit.product && isAdmin && (
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                <input type="checkbox" checked={!edit.active} onChange={(e) => setEdit({ ...edit, active: !e.target.checked })} className="rounded" />
                In der Auswahl ausblenden (bestehende Verträge bleiben)
              </label>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEdit(null)}>Abbrechen</Button>
              <Button loading={saving} onClick={saveEdit}>{edit.product ? 'Speichern' : 'Anlegen'}</Button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
};

/** Zeile mit optionaler Bereichs-Überschrift davor */
const FragmentRow = ({ header, color, cols, children }: { header: string | null; color: string; cols: number; children: React.ReactNode }) => (
  <>
    {header && (
      <tr className="bg-gray-50 dark:bg-gray-900/40">
        <td colSpan={cols} className="px-4 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 sm:px-6">
          <span className="mr-2 inline-block h-2 w-2 rounded-full align-middle" style={{ background: color }} />
          {header}
        </td>
      </tr>
    )}
    {children}
  </>
);
