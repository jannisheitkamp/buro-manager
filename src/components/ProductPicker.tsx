import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Plus, Search, Star } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { AREAS, METHODS, areaOf, matchesProduct, useProducts, type CalcMethod, type Product } from '@/lib/products';
import { Modal } from '@/components/Modal';
import { Button, Field } from '@/components/ui';
import { cn } from '@/utils/cn';

type Props = {
  value: string;
  onChange: (p: Product) => void;
  /** Meistgenutzte Produkte zuerst (Namen, absteigend) */
  favorites?: string[];
  id?: string;
};

type Option = { kind: 'product'; p: Product; fav?: boolean } | { kind: 'create' };

/** Produktauswahl mit Suche, Favoriten und „neues Produkt anlegen“ */
export const ProductPicker = ({ value, onChange, favorites = [], id }: Props) => {
  const { products, reload } = useProducts();
  const { user } = useStore();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [creating, setCreating] = useState<{ name: string; area: string; method: CalcMethod } | null>(null);
  const [saving, setSaving] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = products.find((p) => p.name === value);
  const visible = useMemo(() => products.filter((p) => p.active || p.name === value), [products, value]);

  const options: Option[] = useMemo(() => {
    const q = query.trim();
    if (q) {
      const hits = visible.filter((p) => matchesProduct(p, q));
      // Treffer am Wortanfang zuerst
      const lq = q.toLowerCase();
      hits.sort((a, b) => Number(!a.name.toLowerCase().startsWith(lq)) - Number(!b.name.toLowerCase().startsWith(lq)) || a.name.localeCompare(b.name, 'de'));
      const exact = products.some((p) => p.name.toLowerCase() === lq);
      return [...hits.map((p) => ({ kind: 'product' as const, p })), ...(exact ? [] : [{ kind: 'create' as const }])];
    }
    const favs = favorites.map((n) => visible.find((p) => p.name === n)).filter((p): p is Product => !!p).slice(0, 6);
    const rest = AREAS.flatMap((a) => visible.filter((p) => p.area === a.id).sort((x, y) => x.name.localeCompare(y.name, 'de')));
    return [...favs.map((p) => ({ kind: 'product' as const, p, fav: true })), ...rest.map((p) => ({ kind: 'product' as const, p }))];
  }, [query, visible, products, favorites]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const choose = (o: Option) => {
    if (o.kind === 'create') {
      const area = AREAS[AREAS.length - 1];
      setCreating({ name: query.trim(), area: area.id, method: area.method });
      setOpen(false);
      return;
    }
    onChange(o.p);
    setOpen(false);
    setQuery('');
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (options[active]) choose(options[active]);
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      setOpen(false);
    }
  };

  const create = async () => {
    if (!creating || !user || !creating.name.trim()) return;
    const area = areaOf(creating.area);
    setSaving(true);
    const { data, error } = await supabase
      .from('insurance_products')
      .insert({ name: creating.name.trim(), area: area.id, calc_method: creating.method, lv_factor: area.lv, default_rate: area.method === creating.method ? area.rate : 0, created_by: user.id })
      .select('*')
      .single();
    setSaving(false);
    if (error) return toast.error(error.code === '23505' ? 'Dieses Produkt gibt es schon.' : 'Produkt konnte nicht angelegt werden.');
    await reload();
    toast.success('Produkt angelegt, für alle sichtbar');
    onChange({ ...(data as Product), lv_factor: Number(data.lv_factor), default_rate: Number(data.default_rate) });
    setCreating(null);
    setQuery('');
  };

  let lastGroup = '';
  return (
    <div ref={rootRef} className="relative">
      <button
        id={id}
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="input flex items-center justify-between gap-2 text-left"
      >
        <span className="flex min-w-0 items-center gap-2">
          {selected && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: areaOf(selected.area).color }} />}
          <span className={cn('truncate', !value && 'text-gray-400')}>{value || 'Produkt wählen'}</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-50 mt-1 min-w-[18rem] animate-pop-in overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800">
          <div className="relative border-b border-gray-100 dark:border-gray-700">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKey}
              placeholder="Suchen, z. B. Musik, Hund, Riester"
              aria-label="Produkt suchen"
              role="combobox"
              aria-expanded
              aria-controls="product-options"
              aria-activedescendant={`product-opt-${active}`}
              className="w-full bg-transparent py-2.5 pl-9 pr-3 text-sm outline-none"
            />
          </div>
          <ul ref={listRef} id="product-options" role="listbox" className="max-h-72 overflow-y-auto py-1">
            {options.length === 0 && <li className="px-3 py-2 text-sm text-gray-500">Nichts gefunden</li>}
            {options.map((o, i) => {
              if (o.kind === 'create') {
                return (
                  <li key="create" id={`product-opt-${i}`} data-index={i} role="option" aria-selected={active === i}>
                    <button type="button" onMouseEnter={() => setActive(i)} onClick={() => choose(o)} className={cn('flex w-full items-center gap-2 border-t border-gray-100 px-3 py-2.5 text-left text-sm font-medium text-brand-700 dark:border-gray-700 dark:text-brand-300', active === i && 'bg-brand-50 dark:bg-brand-900/30')}>
                      <Plus className="h-4 w-4" /> „{query.trim()}“ als neues Produkt anlegen
                    </button>
                  </li>
                );
              }
              const group = o.fav ? 'Häufig von dir' : query ? '' : areaOf(o.p.area).label;
              const header = group && group !== lastGroup ? group : '';
              lastGroup = group;
              return (
                <li key={`${o.fav ? 'f' : 'p'}-${o.p.id}`} id={`product-opt-${i}`} data-index={i} role="option" aria-selected={active === i}>
                  {header && <p className="px-3 pb-1 pt-2.5 text-2xs font-semibold uppercase tracking-wide text-gray-400">{header}</p>}
                  <button type="button" onMouseEnter={() => setActive(i)} onClick={() => choose(o)} className={cn('flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm', active === i && 'bg-gray-100 dark:bg-gray-700/60')}>
                    {o.fav ? <Star className="h-3.5 w-3.5 shrink-0 text-amber-500" /> : <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: areaOf(o.p.area).color }} />}
                    <span className="min-w-0 flex-1 truncate text-gray-800 dark:text-gray-100">{o.p.name}</span>
                    {query && <span className="shrink-0 text-2xs text-gray-400">{areaOf(o.p.area).label}</span>}
                    {o.p.name === value && <Check className="h-4 w-4 shrink-0 text-brand-600" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <Modal isOpen={!!creating} onClose={() => setCreating(null)} title="Neues Produkt" description="Wird für das ganze Team in die Liste aufgenommen." size="sm">
        {creating && (
          <div className="space-y-4">
            <Field label="Name" htmlFor="np-name">
              <input id="np-name" autoFocus value={creating.name} onChange={(e) => setCreating({ ...creating, name: e.target.value })} className="input" />
            </Field>
            <Field label="Bereich" htmlFor="np-area">
              <select id="np-area" value={creating.area} onChange={(e) => setCreating({ ...creating, area: e.target.value, method: areaOf(e.target.value).method })} className="input">
                {AREAS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </Field>
            <Field label="Provision berechnen als" htmlFor="np-method" hint={METHODS.find((m) => m.id === creating.method)?.hint}>
              <select id="np-method" value={creating.method} onChange={(e) => setCreating({ ...creating, method: e.target.value as CalcMethod })} className="input">
                {METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </Field>
            <p className="text-xs text-gray-500">Deinen Provisionssatz trägst du danach in der Produktion unter „Provisionssätze“ ein.</p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setCreating(null)}>Abbrechen</Button>
              <Button icon={Plus} loading={saving} onClick={create}>Anlegen</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
