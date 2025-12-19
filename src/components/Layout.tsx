import { Link, useLocation } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { 
  LayoutDashboard, 
  CalendarDays, 
  Building2, 
  ClipboardList, 
  BarChart2,
  Users, 
  UserCircle, 
  LogOut,
  Menu,
  Moon,
  Sun,
  Package,
  Phone,
  TrendingUp
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { useState } from 'react';
import { useTheme } from '@/hooks/useTheme';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Kalender', href: '/general-calendar', icon: CalendarDays },
  { name: 'Abwesenheiten', href: '/calendar', icon: CalendarDays },
  { name: 'Buchungen', href: '/bookings', icon: Building2 },
  { name: 'Produktion', href: '/production', icon: TrendingUp },
  { name: 'Schwarzes Brett', href: '/board', icon: ClipboardList },
  { name: 'Umfragen', href: '/polls', icon: BarChart2 },
  { name: 'Rückrufe', href: '/callbacks', icon: Phone },
  { name: 'Pakete', href: '/parcels', icon: Package },
  { name: 'Verzeichnis', href: '/directory', icon: Users },
  { name: 'Profil', href: '/profile', icon: UserCircle },
];

export const Layout = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const signOut = useStore((state) => state.signOut);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col lg:flex-row transition-colors duration-200">
      {/* Mobile Header */}
      <div className="lg:hidden bg-white dark:bg-gray-800 border-b dark:border-gray-700 p-4 flex items-center justify-between sticky top-0 z-30">
        <h1 className="text-lg font-bold text-gray-900 dark:text-white">Büro Manager</h1>
        <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 rounded-full transition-colors"
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <button
              className="p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 rounded-md"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              <Menu className="h-6 w-6" />
            </button>
        </div>
      </div>

      {/* Sidebar */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-40 w-64 bg-white/80 dark:bg-gray-800/80 backdrop-blur-md border-r border-gray-200/50 dark:border-gray-700/50 transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:inset-0 lg:h-screen lg:sticky lg:top-0 shadow-lg lg:shadow-none",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="h-full flex flex-col">
          <div className="p-6 border-b border-gray-200/50 dark:border-gray-700/50 flex items-center justify-between hidden lg:flex">
            <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-blue-500 bg-clip-text text-transparent">Büro Manager</h1>
            <button
              onClick={toggleTheme}
              className="p-2 text-gray-500 hover:bg-gray-100/50 dark:text-gray-400 dark:hover:bg-gray-700/50 rounded-full transition-colors"
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
          </div>
          
          <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200",
                    isActive 
                      ? "bg-indigo-50 text-indigo-700 shadow-sm dark:bg-indigo-900/20 dark:text-indigo-300 translate-x-1" 
                      : "text-gray-600 hover:bg-gray-50/80 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700/50 dark:hover:text-gray-200 hover:translate-x-1"
                  )}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <Icon className={cn("h-5 w-5 transition-transform", isActive ? "scale-110" : "")} />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t border-gray-200/50 dark:border-gray-700/50">
            <button
              onClick={() => signOut()}
              className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-red-600 dark:text-red-400 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 w-full transition-colors"
            >
              <LogOut className="h-5 w-5" />
              Abmelden
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 z-50 px-6 py-2 flex justify-between items-center safe-area-pb">
        {navigation.slice(0, 5).map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.href;
          return (
            <Link
              key={item.name}
              to={item.href}
              className={cn(
                "flex flex-col items-center gap-1 p-2 rounded-lg transition-colors",
                isActive 
                  ? "text-indigo-600 dark:text-indigo-400" 
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
              )}
            >
              <Icon className={cn("h-6 w-6 transition-transform", isActive ? "scale-110" : "")} />
              <span className="text-[10px] font-medium">{item.name}</span>
            </Link>
          );
        })}
        <button
           className="flex flex-col items-center gap-1 p-2 rounded-lg text-gray-500 dark:text-gray-400"
           onClick={() => setIsMobileMenuOpen(true)}
        >
            <Menu className="h-6 w-6" />
            <span className="text-[10px] font-medium">Mehr</span>
        </button>
      </div>

      {/* Overlay for mobile */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-8 lg:p-12 overflow-y-auto w-full max-w-full pb-24 lg:pb-12">
        {children}
      </main>
    </div>
  );
};
