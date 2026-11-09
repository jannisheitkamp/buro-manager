import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, CornerDownLeft } from 'lucide-react';
import { Dialog, DialogPanel, Combobox, ComboboxInput, ComboboxOptions, ComboboxOption } from '@headlessui/react';
import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { ALL_NAV_ITEMS } from '@/lib/navigation';
import { useStore } from '@/store/useStore';
import { Avatar } from '@/components/ui';
import { cn } from '@/utils/cn';
import type { LucideIcon } from 'lucide-react';

export const useCommandPalette = create<{ open: boolean; setOpen: (o: boolean) => void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

type Item =
  | { kind: 'page'; id: string; name: string; href: string; icon: LucideIcon; keywords: string }
  | { kind: 'person'; id: string; name: string; href: string; avatar?: string | null; meta?: string | null };

export const CommandPalette = () => {
  const { open, setOpen } = useCommandPalette();
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<Item[]>([]);
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
  const results = q
    ? [
        ...pages.filter((p) => p.kind === 'page' && p.keywords.includes(q)),
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
                placeholder="Seite oder Kollegen suchen"
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
                      {item.kind === 'page' ? (
                        <span className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 text-gray-500 dark:border-gray-700 dark:text-gray-400">
                          <item.icon className="h-4 w-4" />
                        </span>
                      ) : (
                        <Avatar name={item.name} src={item.avatar} size="xs" className="mx-0.5" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{item.name}</span>
                        {item.kind === 'person' && item.meta && <span className="block truncate text-xs text-gray-500">{item.meta}</span>}
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
