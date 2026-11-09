import { create } from 'zustand';

type Theme = 'light' | 'dark';

const readInitial = (): Theme => {
  try {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* Speicher nicht verfügbar */
  }
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const apply = (theme: Theme) => {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  try {
    localStorage.setItem('theme', theme);
  } catch {
    /* ignorieren */
  }
};

// Ein gemeinsamer Zustand, damit alle Schalter synchron bleiben
const useThemeStore = create<{ theme: Theme; setTheme: (t: Theme) => void }>((set) => ({
  theme: readInitial(),
  setTheme: (theme) => {
    apply(theme);
    set({ theme });
  },
}));

apply(useThemeStore.getState().theme);

export function useTheme() {
  const { theme, setTheme } = useThemeStore();
  return {
    theme,
    isDark: theme === 'dark',
    toggleTheme: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
  };
}
