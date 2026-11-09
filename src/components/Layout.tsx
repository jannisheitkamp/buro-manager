import { Suspense, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Menu as MenuRoot, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { Bot, LogOut, Menu, Moon, Search, Sun, X, UserCircle, Grid2x2 } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { useTheme } from '@/hooks/useTheme';
import { supabase } from '@/lib/supabase';
import { ADMIN_ITEM, MOBILE_TABS, NAV_GROUPS, PROFILE_ITEM, findNavItem, type NavItem } from '@/lib/navigation';
import { useNotifications } from '@/hooks/useNotifications';
import { cn } from '@/utils/cn';
import { CommandPalette, useCommandPalette } from './CommandPalette';
import { AIAssistant, useAssistant } from './AIAssistant';
import { NotificationCenter } from './NotificationCenter';
import { Avatar, PageLoading } from './ui';
import { PageTransition } from './PageTransition';

const isActivePath = (pathname: string, href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

/* ------------------------------------------------------------------ */

const usePendingApprovals = (isAdmin: boolean) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isAdmin) return;
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      const { count } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('is_approved', false);
      setCount(count || 0);
    };
    check();
    const channel = supabase
      .channel('layout-pending-profiles')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        clearTimeout(timer);
        timer = setTimeout(check, 500);
      })
      .subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [isAdmin]);

  return count;
};

/* ------------------------------------------------------------------ */

const SidebarLink = ({ item, badge, onNavigate }: { item: NavItem; badge?: number; onNavigate?: () => void }) => {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.href}
      end={item.href === '/'}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[0.8125rem] font-medium transition-colors',
          isActive ? 'bg-white/10 text-white' : 'text-brand-100/70 hover:bg-white/5 hover:text-white',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute -left-3 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r bg-amber-400" aria-hidden />}
          <Icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-amber-300' : 'text-brand-200/60 group-hover:text-brand-100')} />
          <span className="truncate">{item.name}</span>
          {!!badge && (
            <span className="tabular ml-auto rounded-md bg-amber-400 px-1.5 text-2xs font-semibold leading-5 text-gray-950">{badge}</span>
          )}
        </>
      )}
    </NavLink>
  );
};

const Sidebar = ({ pendingCount, onNavigate }: { pendingCount: number; onNavigate?: () => void }) => {
  const isAdmin = useStore((s) => s.profile?.roles?.includes('admin'));
  return (
    <div className="flex h-full flex-col bg-brand-900 text-white dark:bg-gray-950">
      <Link to="/" onClick={onNavigate} className="flex items-center gap-2.5 px-5 pb-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <img src="/favicon.svg" alt="" className="h-8 w-8" />
        <span className="font-display text-[1.05rem] font-semibold tracking-tight">Büro Manager</span>
      </Link>

      <nav className="scrollbar-thin flex-1 space-y-5 overflow-y-auto px-3 pb-4" aria-label="Hauptnavigation">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="mb-1 px-3 text-2xs font-medium text-brand-200/50">{group.label}</p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <SidebarLink
                  key={item.href}
                  item={item}
                  onNavigate={onNavigate}
                  badge={item.href === '/directory' && isAdmin ? pendingCount : undefined}
                />
              ))}
            </div>
          </div>
        ))}
        {isAdmin && (
          <div>
            <p className="mb-1 px-3 text-2xs font-medium text-brand-200/50">Verwaltung</p>
            <SidebarLink item={ADMIN_ITEM} onNavigate={onNavigate} />
          </div>
        )}
      </nav>
    </div>
  );
};

/* ------------------------------------------------------------------ */

const UserMenu = () => {
  const profile = useStore((s) => s.profile);
  const signOut = useStore((s) => s.signOut);
  const navigate = useNavigate();
  return (
    <MenuRoot as="div" className="relative">
      <MenuButton className="flex items-center gap-2 rounded-full p-0.5 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Konto">
        <Avatar name={profile?.full_name} src={profile?.avatar_url} size="sm" />
      </MenuButton>
      <MenuItems
        anchor={{ to: 'bottom end', gap: 8 }}
        className="z-50 w-56 animate-pop-in rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl focus:outline-none dark:border-gray-700 dark:bg-gray-800"
      >
        <div className="px-2.5 py-2">
          <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{profile?.full_name || 'Ohne Namen'}</p>
          <p className="truncate text-xs text-gray-500">{profile?.email}</p>
        </div>
        <div className="my-1 h-px bg-gray-100 dark:bg-gray-700" />
        <MenuItem>
          <button
            type="button"
            onClick={() => navigate(PROFILE_ITEM.href)}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-gray-700 data-[focus]:bg-gray-100 dark:text-gray-200 dark:data-[focus]:bg-gray-700"
          >
            <UserCircle className="h-4 w-4" /> Mein Profil
          </button>
        </MenuItem>
        <MenuItem>
          <button
            type="button"
            onClick={() => signOut()}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-red-600 data-[focus]:bg-red-50 dark:text-red-400 dark:data-[focus]:bg-red-900/30"
          >
            <LogOut className="h-4 w-4" /> Abmelden
          </button>
        </MenuItem>
      </MenuItems>
    </MenuRoot>
  );
};

const Topbar = ({ onOpenMenu }: { onOpenMenu: () => void }) => {
  const location = useLocation();
  const { isDark, toggleTheme } = useTheme();
  const openSearch = useCommandPalette((s) => s.setOpen);
  const assistant = useAssistant();
  const current = findNavItem(location.pathname);
  const group = NAV_GROUPS.find((g) => g.items.some((i) => i.href === current?.href));

  return (
    <header className="sticky top-0 z-30 border-b border-gray-200/80 bg-gray-50/85 pt-[env(safe-area-inset-top)] backdrop-blur-md dark:border-gray-800 dark:bg-gray-900/85">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-2 px-4 sm:px-6 lg:px-8">
        <button type="button" onClick={onOpenMenu} className="btn-icon -ml-2 lg:hidden" aria-label="Menü öffnen">
          <Menu className="h-5 w-5" />
        </button>

        <div className="min-w-0 flex-1 text-sm">
          <span className="hidden text-gray-400 sm:inline">{group?.label || 'Konto'}</span>
          {current && (
            <>
              <span className="mx-2 hidden text-gray-300 dark:text-gray-600 sm:inline">/</span>
              <span className="font-medium text-gray-900 dark:text-white">{current.name}</span>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => openSearch(true)}
          className="hidden h-9 w-64 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-400 transition-colors hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600 md:flex"
        >
          <Search className="h-4 w-4" />
          <span className="flex-1 text-left">Suchen</span>
          <kbd className="rounded border border-gray-200 px-1.5 font-mono text-2xs dark:border-gray-600">⌘K</kbd>
        </button>
        <button type="button" onClick={() => openSearch(true)} className="btn-icon md:hidden" aria-label="Suchen">
          <Search className="h-[18px] w-[18px]" />
        </button>

        <button
          type="button"
          onClick={() => assistant.setOpen(!assistant.open)}
          className={cn('btn-icon', assistant.open && 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-white')}
          aria-label="Assistent"
          title="Assistent"
        >
          <Bot className="h-[18px] w-[18px]" />
        </button>
        <NotificationCenter />
        <button type="button" onClick={toggleTheme} className="btn-icon" aria-label={isDark ? 'Hell' : 'Dunkel'} title={isDark ? 'Helles Design' : 'Dunkles Design'}>
          {isDark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
        </button>
        <div className="ml-1">
          <UserMenu />
        </div>
      </div>
    </header>
  );
};

const MobileTabBar = ({ onOpenMenu }: { onOpenMenu: () => void }) => {
  const location = useLocation();
  return (
    <nav
      className="safe-area-pb fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-2 pt-1.5 backdrop-blur-md dark:border-gray-800 dark:bg-gray-900/95 lg:hidden"
      aria-label="Schnellnavigation"
    >
      <div className="mx-auto flex max-w-md items-stretch justify-around">
        {MOBILE_TABS.map((item) => {
          const active = isActivePath(location.pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                'flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10px] font-medium transition-colors',
                active ? 'text-brand-700 dark:text-brand-300' : 'text-gray-500 dark:text-gray-400',
              )}
            >
              <Icon className="h-5 w-5" strokeWidth={active ? 2.25 : 1.75} />
              {item.name}
            </Link>
          );
        })}
        <button type="button" onClick={onOpenMenu} className="flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10px] font-medium text-gray-500 dark:text-gray-400">
          <Grid2x2 className="h-5 w-5" strokeWidth={1.75} />
          Mehr
        </button>
      </div>
    </nav>
  );
};

/* ------------------------------------------------------------------ */

export const Layout = () => {
  const profile = useStore((s) => s.profile);
  const loading = useStore((s) => s.loading);
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const isAdmin = !!profile?.roles?.includes('admin');
  const pendingCount = usePendingApprovals(isAdmin);

  useNotifications();

  // Nicht freigeschaltete Konten umleiten
  useEffect(() => {
    if (!loading && profile && !profile.is_approved && !isAdmin) {
      navigate('/pending-approval', { replace: true });
    }
  }, [profile, isAdmin, loading, navigate]);

  // Mobiles Menü bei Seitenwechsel schließen
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // Nach Seitenwechsel nach oben scrollen
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div className="min-h-dvh lg:pl-60">
      <CommandPalette />
      <AIAssistant />

      {/* Seitenleiste Desktop */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 lg:block">
        <Sidebar pendingCount={pendingCount} />
      </aside>

      {/* Seitenleiste Mobil */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 animate-fade-in bg-gray-950/50" onClick={() => setMenuOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] animate-[pop-in_180ms_ease-out] shadow-2xl">
            <Sidebar pendingCount={pendingCount} onNavigate={() => setMenuOpen(false)} />
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              className="absolute right-3 top-[max(1.1rem,env(safe-area-inset-top))] rounded-lg p-2 text-brand-100 hover:bg-white/10"
              aria-label="Menü schließen"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      <Topbar onOpenMenu={() => setMenuOpen(true)} />

      <main className="mx-auto w-full max-w-[1440px] px-4 pb-28 pt-6 sm:px-6 sm:pt-8 lg:px-8 lg:pb-16">
        <Suspense fallback={<PageLoading />}>
          <PageTransition key={location.pathname}>
            <Outlet />
          </PageTransition>
        </Suspense>
      </main>

      <MobileTabBar onOpenMenu={() => setMenuOpen(true)} />
    </div>
  );
};
