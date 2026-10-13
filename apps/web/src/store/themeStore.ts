import { create } from 'zustand';

export type Theme = 'light' | 'dark' | 'system';

interface ThemeState {
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  initTheme: () => void;
}

const getSystemTheme = (): 'light' | 'dark' => {
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
};

const applyThemeClass = (resolved: 'light' | 'dark') => {
  const root = document.documentElement;
  if (resolved === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
};

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: 'system',
  resolvedTheme: 'dark',

  setTheme: (theme: Theme) => {
    localStorage.setItem('relay_theme', theme);
    const resolved = theme === 'system' ? getSystemTheme() : theme;
    applyThemeClass(resolved);
    set({ theme, resolvedTheme: resolved });
  },

  toggleTheme: () => {
    const current = get().resolvedTheme;
    const next = current === 'dark' ? 'light' : 'dark';
    get().setTheme(next);
  },

  initTheme: () => {
    const saved = (localStorage.getItem('relay_theme') as Theme) || 'system';
    const resolved = saved === 'system' ? getSystemTheme() : saved;
    applyThemeClass(resolved);
    set({ theme: saved, resolvedTheme: resolved });

    // Listen for OS system preference changes
    if (typeof window !== 'undefined') {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (get().theme === 'system') {
          const newResolved = e.matches ? 'dark' : 'light';
          applyThemeClass(newResolved);
          set({ resolvedTheme: newResolved });
        }
      });
    }
  },
}));
