import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Search, 
  LayoutDashboard, 
  Phone, 
  Package, 
  TrendingUp, 
  UserCircle,
  Calendar,
  Users
} from 'lucide-react';
import { Dialog, Combobox, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { cn } from '@/utils/cn';

export const CommandPalette = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
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

  const pages = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Produktion & Umsatz', href: '/production', icon: TrendingUp },
    { name: 'Rückrufe', href: '/callbacks', icon: Phone },
    { name: 'Pakete', href: '/parcels', icon: Package },
    { name: 'Kalender', href: '/general-calendar', icon: Calendar },
    { name: 'Verzeichnis', href: '/directory', icon: Users },
    { name: 'Profil', href: '/profile', icon: UserCircle },
  ];

  const filteredPages = query === ''
    ? pages
    : pages.filter((page) =>
        page.name.toLowerCase().includes(query.toLowerCase())
      );

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
              <Combobox onChange={(page: any) => {
                if (page) {
                    navigate(page.href);
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
                    placeholder="Suche nach Seiten... (Cmd+K)"
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </div>

                {filteredPages.length > 0 && (
                  <Combobox.Options static className="max-h-72 scroll-py-2 overflow-y-auto py-2 text-sm text-gray-800 dark:text-gray-200">
                    {filteredPages.map((page) => (
                      <Combobox.Option
                        key={page.href}
                        value={page}
                        className={({ active }) =>
                          cn(
                            'cursor-default select-none px-4 py-2 flex items-center gap-3',
                            active ? 'bg-indigo-600 text-white' : ''
                          )
                        }
                      >
                        {({ active }) => (
                          <>
                            <page.icon className={cn("h-5 w-5", active ? "text-white" : "text-gray-400")} />
                            <span className={cn("flex-1", active ? "font-semibold" : "")}>{page.name}</span>
                            {active && <span className="text-xs text-indigo-200">Enter</span>}
                          </>
                        )}
                      </Combobox.Option>
                    ))}
                  </Combobox.Options>
                )}

                {query !== '' && filteredPages.length === 0 && (
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
