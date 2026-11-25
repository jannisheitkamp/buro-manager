import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, CornerDownLeft, Contact, FileText, Target } from 'lucide-react';
import { Dialog, DialogPanel, Combobox, ComboboxInput, ComboboxOptions, ComboboxOption } from '@headlessui/react';
import { useCommandPalette } from '@/store/overlays';
import { supabase } from '@/lib/supabase';
import { ALL_NAV_ITEMS } from '@/lib/navigation';
import { useStore } from '@/store/useStore';
import { Avatar } from '@/components/ui';
import { cn } from '@/utils/cn';
import type { LucideIcon } from 'lucide-react';

type Item =
  | { kind: 'page'; id: string; name: string; href: string; icon: LucideIcon; keywords: string }
  | { kind: 'person'; id: string; name: string; href: string; avatar?: string | null; meta?: string | null }
  | { kind: 'record'; id: string; name: string; href: string; icon: LucideIcon; meta?: string | null; haystack: string };

const MAX_PER_GROUP = 6;
const digits = (v?: string | null) => (v || '').replace(/\D/g, '');

export const CommandPalette = () => {
  const { open, setOpen } = useCommandPalette();
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<Item[]>([]);
  const [records, setRecords] = useState<Item[] | null>(null);
  const navigate = useNavigate();
  const isAdmin = useStore((s) => s.profile?.roles?.includes('admin'));

  useEffect(() => {
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(!useCommandPalette.getState().open);
      }
    };
    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  }, [setOpen]);

  // Kollegen erst laden, wenn die Suche das erste Mal geöffnet wird
  useEffect(() => {
    if (!open || people.length > 0) return;
    supabase
      .from('profiles')
      .select('id, full_name, avatar_url, phone_extension, is_approved')
      .order('full_name')
      .then(({ data }) => {
        if (!data) return;
        setPeople(
          data
            .filter((p) => p.is_approved !== false)
            .map((p) => ({
              kind: 'person' as const,
              id: p.id,
              name: p.full_name || 'Ohne Namen',
              href: `/directory?user=${p.id}`,
              avatar: p.avatar_url,
              meta: p.phone_extension ? `Durchwahl ${p.phone_extension}` : null,
            })),
        );
      });
  }, [open, people.length]);

  // Kunden, Verträge und Leads bei jedem Öffnen frisch laden
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([
      supabase.from('customers').select('id, last_name, first_name, phone, email, birth_date'),
      supabase.from('production_entries').select('id, customer_id, policy_number, sub_category, category, customer_name, customer_firstname').not('policy_number', 'is', null),
      supabase.from('leads').select('id, customer_name, phone, product, status'),
      supabase.from('customer_contracts').select('id, customer_id, policy_number, sub_category, insurer').not('policy_number', 'is', null),
    ]).then(([c, e, l, x2]) => {
      if (cancelled) return;
      const name = (last: string, first?: string | null) => `${last}${first ? `, ${first}` : ''}`;
      const items: Item[] = [
        ...(c.data || []).map((x) => ({
          kind: 'record' as const,
          id: `c-${x.id}`,
          name: name(x.last_name, x.first_name),
          href: `/customers?c=${x.id}`,
          icon: Contact,
          meta: ['Kunde', x.phone, x.birth_date ? `geb. ${x.birth_date.split('-').reverse().join('.')}` : null].filter(Boolean).join(' · '),
          haystack: `${x.last_name} ${x.first_name || ''} ${x.first_name || ''} ${x.last_name} ${x.email || ''} ${digits(x.phone)}`.toLowerCase(),
        })),
        ...(e.data || [])
          .filter((x) => x.policy_number)
          .map((x) => ({
            kind: 'record' as const,
            id: `e-${x.id}`,
            name: x.policy_number!,
            href: x.customer_id ? `/customers?c=${x.customer_id}` : '/production',
            icon: FileText,
            meta: `${x.sub_category || x.category} · ${name(x.customer_name, x.customer_firstname)}`,
            haystack: x.policy_number!.toLowerCase().replace(/\s/g, ''),
          })),
        ...(x2.data || []).map((x) => {
          const cu = (c.data || []).find((k) => k.id === x.customer_id);
          return {
            kind: 'record' as const,
            id: `x-${x.id}`,
            name: x.policy_number!,
            href: `/customers?c=${x.customer_id}`,
            icon: FileText,
            meta: [`${x.sub_category} (Bestand)`, x.insurer, cu ? name(cu.last_name, cu.first_name) : null].filter(Boolean).join(' · '),
            haystack: x.policy_number!.toLowerCase().replace(/\s/g, ''),
          };
        }),
        ...(l.data || []).map((x) => ({
          kind: 'record' as const,
          id: `l-${x.id}`,
          name: x.customer_name,
          href: '/leads',
          icon: Target,
          meta: ['Lead', x.product, x.phone].filter(Boolean).join(' · '),
          haystack: `${x.customer_name} ${digits(x.phone)}`.toLowerCase(),
        })),
      ];
      setRecords(items);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const pages = useMemo<Item[]>(
    () =>
      ALL_NAV_ITEMS.filter((i) => i.href !== '/admin' || isAdmin).map((i) => ({
        kind: 'page' as const,
        id: i.href,
        name: i.name,
        href: i.href,
        icon: i.icon,
        keywords: `${i.name} ${i.keywords || ''}`.toLowerCase(),
      })),
    [isAdmin],
  );

  const q = query.trim().toLowerCase();
  const qDigits = digits(q);
  const qCompact = q.replace(/\s/g, '');
  const matchRecord = (r: Item) =>
    r.kind === 'record' && (q.split(/\s+/).every((w) => r.haystack.includes(w)) || r.haystack.includes(qCompact) || (qDigits.length >= 4 && r.haystack.includes(qDigits)));
  const results = q
    ? [
        ...pages.filter((p) => p.kind === 'page' && p.keywords.includes(q)),
        ...(records || []).filter((r) => r.id.startsWith('c-') && matchRecord(r)).slice(0, MAX_PER_GROUP),
        ...(records || []).filter((r) => r.id.startsWith('e-') && matchRecord(r)).slice(0, MAX_PER_GROUP),
        ...(records || []).filter((r) => r.id.startsWith('l-') && matchRecord(r)).slice(0, MAX_PER_GROUP),
        ...people.filter((p) => p.name.toLowerCase().includes(q)),
      ]
    : pages;

  const close = () => {
    setOpen(false);
    setTimeout(() => setQuery(''), 150);
  };

  return (
    <Dialog open={open} onClose={close} className="relative z-[70]">
      <div className="fixed inset-0 animate-fade-in bg-gray-950/40 backdrop-blur-[2px]" aria-hidden />
      <div className="fixed inset-0 overflow-y-auto p-3 pt-[12vh] sm:p-6 sm:pt-[14vh]">
        <DialogPanel className="mx-auto max-w-xl animate-pop-in overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800">
          <Combobox
            onChange={(item: Item | null) => {
              if (!item) return;
              navigate(item.href);
              close();
            }}
          >
            <div className="relative border-b border-gray-100 dark:border-gray-700">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <ComboboxInput
                autoFocus
                className="h-12 w-full !rounded-none !border-0 bg-transparent pl-11 pr-4 text-sm !ring-0 focus:!ring-0"
                placeholder="Kunde, Schein-Nr., Telefon, Seite oder Kollegen"
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            <ComboboxOptions static className="scrollbar-thin max-h-80 overflow-y-auto p-1.5">
              {results.length === 0 && <p className="px-3 py-6 text-center text-sm text-gray-500">Keine Treffer für „{query}“.</p>}
              {results.map((item) => (
                <ComboboxOption
                  key={`${item.kind}-${item.id}`}
                  value={item}
                  className={({ focus }) =>
                    cn(
                      'flex cursor-default select-none items-center gap-3 rounded-lg px-2.5 py-2 text-sm',
                      focus ? 'bg-brand-50 text-brand-900 dark:bg-brand-900/50 dark:text-white' : 'text-gray-700 dark:text-gray-200',
                    )
                  }
                >
                  {({ focus }) => (
                    <>
                      {item.kind === 'page' || item.kind === 'record' ? (
                        <span className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 text-gray-500 dark:border-gray-700 dark:text-gray-400">
                          <item.icon className="h-4 w-4" />
                        </span>
                      ) : (
                        <Avatar name={item.name} src={item.avatar} size="xs" className="mx-0.5" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{item.name}</span>
                        {item.kind !== 'page' && item.meta && <span className="block truncate text-xs text-gray-500">{item.meta}</span>}
                      </span>
                      {focus && <CornerDownLeft className="h-3.5 w-3.5 text-gray-400" />}
                    </>
                  )}
                </ComboboxOption>
              ))}
            </ComboboxOptions>
          </Combobox>
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-2 text-2xs text-gray-400 dark:border-gray-700">
            <span>Pfeiltasten zum Auswählen, Enter zum Öffnen</span>
            <kbd className="rounded border border-gray-200 px-1.5 font-mono dark:border-gray-700">Esc</kbd>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
};
