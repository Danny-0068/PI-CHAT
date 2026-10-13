import React from 'react';
import { Sun, Moon, Laptop } from 'lucide-react';
import { useThemeStore, Theme } from '../store/themeStore';

export const ThemeToggle: React.FC = () => {
  const { theme, resolvedTheme, setTheme } = useThemeStore();

  const options: { value: Theme; label: string; icon: React.ReactNode }[] = [
    { value: 'light', label: 'Light', icon: <Sun className="w-4 h-4" /> },
    { value: 'dark', label: 'Dark', icon: <Moon className="w-4 h-4" /> },
    { value: 'system', label: 'System', icon: <Laptop className="w-4 h-4" /> },
  ];

  return (
    <div className="inline-flex items-center p-1 rounded-lg bg-panel border border-border shadow-sm">
      {options.map((opt) => {
        const isActive = theme === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => setTheme(opt.value)}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
              isActive
                ? 'bg-elevated text-content-primary shadow-sm border border-border'
                : 'text-content-secondary hover:text-content-primary hover:bg-floor'
            }`}
            title={`Set theme to ${opt.label} (Current: ${resolvedTheme})`}
            aria-label={`Set theme to ${opt.label}`}
          >
            {opt.icon}
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
};
