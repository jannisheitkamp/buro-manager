import {
  LayoutDashboard,
  CalendarDays,
  CalendarOff,
  DoorOpen,
  ClipboardList,
  BarChart2,
  Users,
  Package,
  Phone,
  TrendingUp,
  Shield,
  Kanban,
  FileText,
  Palmtree,
  Headset,
  UserCircle,
  type LucideIcon,
} from 'lucide-react';

export type NavItem = {
  name: string;
  href: string;
  icon: LucideIcon;
  keywords?: string;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Heute',
    items: [
      { name: 'Übersicht', href: '/', icon: LayoutDashboard, keywords: 'dashboard start home' },
      { name: 'Empfang', href: '/reception', icon: Headset, keywords: 'rezeption plan' },
      { name: 'Anrufe', href: '/calls', icon: Phone, keywords: 'telefon rückruf wiedervorlage callback' },
      { name: 'Pakete', href: '/parcels', icon: Package, keywords: 'post lieferung' },
    ],
  },
  {
    label: 'Kunden & Umsatz',
    items: [
      { name: 'Leads', href: '/leads', icon: Kanban, keywords: 'kunden pipeline' },
      { name: 'Produktion', href: '/production', icon: TrendingUp, keywords: 'umsatz provision verträge lebenswerte' },
    ],
  },
  {
    label: 'Planung',
    items: [
      { name: 'Kalender', href: '/general-calendar', icon: CalendarDays, keywords: 'termine' },
      { name: 'Abwesenheiten', href: '/calendar', icon: CalendarOff, keywords: 'urlaub krank seminar schule' },
      { name: 'Urlaubskonto', href: '/vacation', icon: Palmtree, keywords: 'resturlaub tage' },
      { name: 'Räume', href: '/bookings', icon: DoorOpen, keywords: 'buchungen besprechung' },
    ],
  },
  {
    label: 'Team',
    items: [
      { name: 'Schwarzes Brett', href: '/board', icon: ClipboardList, keywords: 'pinnwand news' },
      { name: 'Umfragen', href: '/polls', icon: BarChart2, keywords: 'abstimmung' },
      { name: 'Dokumente', href: '/documents', icon: FileText, keywords: 'dateien' },
      { name: 'Verzeichnis', href: '/directory', icon: Users, keywords: 'kollegen mitarbeiter' },
    ],
  },
];

export const ADMIN_ITEM: NavItem = { name: 'Verwaltung', href: '/admin', icon: Shield, keywords: 'admin' };
export const PROFILE_ITEM: NavItem = { name: 'Mein Profil', href: '/profile', icon: UserCircle, keywords: 'einstellungen konto' };

export const MOBILE_TABS: NavItem[] = [
  NAV_GROUPS[0].items[0],
  NAV_GROUPS[0].items[2],
  NAV_GROUPS[1].items[1],
  NAV_GROUPS[2].items[0],
];

export const ALL_NAV_ITEMS: NavItem[] = [...NAV_GROUPS.flatMap((g) => g.items), PROFILE_ITEM, ADMIN_ITEM];

export const findNavItem = (pathname: string) =>
  ALL_NAV_ITEMS.find((i) => (i.href === '/' ? pathname === '/' : pathname.startsWith(i.href)));
