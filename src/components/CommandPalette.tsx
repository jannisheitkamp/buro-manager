import { useEffect, useState, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Search, 
  LayoutDashboard, 
  Phone, 
  Package, 
  TrendingUp, 
  UserCircle,
  Calendar,
  Users,
  Building2,
  ClipboardList,
  BarChart2
} from 'lucide-react';
import { Dialog, Combobox, Transition } from '@headlessui/react';
import { cn } from '@/utils/cn';
import { supabase } from '@/lib/supabase';

type Item = {
    id: string;
    name: string;
    href: string;
    icon: any;
    type: 'page' | 'colleague';
    meta?: string;
};

export const CommandPalette = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [colleagues, setColleagues] = useState<Item[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setIsOpen(!isOpen);
      }
    };
    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  }, [isOpen]);

  // Fetch colleagues once when opened or mounted
  useEffect(() => {
      const fetchColleagues = async () => {
          const { data } = await supabase.from('profiles').select('id, full_name, email');
          if (data) {
              setColleagues(data.map(p => ({
                  id: p.id,
                  name: p.full_name || 'Unbekannt',
                  href: `/directory`, // In future: /profile/${p.id}
                  icon: Users,
                  type: 'colleague',
                  meta: p.email
              })));
          }
      };
      fetchColleagues();
  }, []);

  const pages: Item[] = [
    { id: 'dash', name: 'Dashboard', href: '/', icon: LayoutDashboard, type: 'page' },
    { id: 'prod', name: 'Produktion & Umsatz', href: '/production', icon: TrendingUp, type: 'page' },
    { id: 'cb', name: 'Rückrufe', href: '/callbacks', icon: Phone, type: 'page' },
    { id: 'parcels', name: 'Pakete', href: '/parcels', icon: Package, type: 'page' },
    { id: 'cal', name: 'Kalender', href: '/general-calendar', icon: Calendar, type: 'page' },
    { id: 'abs', name: 'Abwesenheiten', href: '/calendar', icon: Calendar, type: 'page' },
    { id: 'dir', name: 'Verzeichnis', href: '/directory', icon: Users, type: 'page' },
    { id: 'prof', name: 'Profil', href: '/profile', icon: UserCircle, type: 'page' },
    { id: 'book', name: 'Buchungen', href: '/bookings', icon: Building2, type: 'page' },
    { id: 'board', name: 'Schwarzes Brett', href: '/board', icon: ClipboardList, type: 'page' },
    { id: 'polls', name: 'Umfragen', href: '/polls', icon: BarChart2, type: 'page' },
  ];

  const filteredItems = query === ''
    ? [...pages, ...colleagues.slice(0, 3)]
    : [
        ...pages.filter((page) => page.name.toLowerCase().includes(query.toLowerCase())),
        ...colleagues.filter((col) => col.name.toLowerCase().includes(query.toLowerCase()))
      ];

  return (
    <Transition.Root show={isOpen} as={Fragment} afterLeave={() => setQuery('')}>
      <Dialog as="div" className="relative z-50" onClose={setIsOpen}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-gray-500/25 dark:bg-black/50 backdrop-blur-sm transition-opacity" />
        </Transition.Child>

        <div className="fixed inset-0 z-10 overflow-y-auto p-4 sm:p-6 md:p-20">
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <Dialog.Panel className="mx-auto max-w-xl transform divide-y divide-gray-100 dark:divide-gray-700 overflow-hidden rounded-xl bg-white dark:bg-gray-800 shadow-2xl ring-1 ring-black ring-opacity-5 transition-all">
              <Combobox onChange={(item: Item) => {
                if (item) {
                    navigate(item.href);
                    setIsOpen(false);
                }
              }}>
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-4 top-3.5 h-5 w-5 text-gray-400"
                    aria-hidden="true"
                  />
                  <Combobox.Input
                    className="h-12 w-full border-0 bg-transparent pl-11 pr-4 text-gray-900 dark:text-white placeholder:text-gray-400 focus:ring-0 sm:text-sm"
                    placeholder="Suche nach Seiten oder Kollegen... (Cmd+K)"
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </div>

                {filteredItems.length > 0 && (
                  <Combobox.Options static className="max-h-96 scroll-py-2 overflow-y-auto py-2 text-sm text-gray-800 dark:text-gray-200">
                    {filteredItems.map((item) => (
                      <Combobox.Option
                        key={`${item.type}-${item.id}`}
                        value={item}
                        className={({ active }) =>
                          cn(
                            'cursor-default select-none px-4 py-2 flex items-center gap-3',
                            active ? 'bg-indigo-600 text-white' : ''
                          )
                        }
                      >
                        {({ active }) => (
                          <>
                            <div className={cn(
                                "p-1.5 rounded-lg",
                                active ? "bg-white/20" : "bg-gray-100 dark:bg-gray-700"
                            )}>
                                <item.icon className={cn("h-4 w-4", active ? "text-white" : "text-gray-500 dark:text-gray-400")} />
                            </div>
                            <div className="flex-1">
                                <span className={cn("block truncate font-medium", active ? "text-white" : "text-gray-900 dark:text-white")}>
                                    {item.name}
                                </span>
                                {item.type === 'colleague' && (
                                    <span className={cn("block truncate text-xs", active ? "text-indigo-200" : "text-gray-500")}>
                                        Kollege • {item.meta}
                                    </span>
                                )}
                            </div>
                            {active && <span className="text-xs text-indigo-200">Öffnen</span>}
                          </>
                        )}
                      </Combobox.Option>
                    ))}
                  </Combobox.Options>
                )}

                {query !== '' && filteredItems.length === 0 && (
                  <p className="p-4 text-sm text-gray-500">Keine Ergebnisse gefunden.</p>
                )}
              </Combobox>
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition.Root>
  );
};
