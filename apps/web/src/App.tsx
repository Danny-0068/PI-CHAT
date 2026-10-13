import React, { useEffect } from 'react';
import { useThemeStore } from './store/themeStore';
import { useAuthStore } from './store/authStore';
import { silentCheckSession } from './lib/api';
import { ThemeToggle } from './components/ThemeToggle';
import { HealthBadge } from './components/HealthBadge';
import { LoginPage } from './features/auth/LoginPage';
import { DashboardShell } from './features/dashboard/DashboardShell';

export const App: React.FC = () => {
  const { initTheme } = useThemeStore();
  const { isAuthenticated, isLoading, setLoading } = useAuthStore();

  useEffect(() => {
    initTheme();
    silentCheckSession().finally(() => {
      setLoading(false);
    });
  }, [initTheme, setLoading]);

  return (
    <div className="min-h-screen bg-floor text-content-primary flex flex-col antialiased selection:bg-accent-subtle selection:text-accent">
      {/* Top Navigation Bar (Panel Surface) */}
      <header className="h-14 border-b border-border bg-panel px-4 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent text-white flex items-center justify-center font-bold text-sm tracking-wider shadow-sm">
            R
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm tracking-tight">Relay</span>
              <span className="text-[11px] px-1.5 py-0.5 rounded font-mono bg-elevated text-content-secondary border border-border">
                Acme Labs Demo
              </span>
            </div>
            <p className="text-[11px] text-content-muted leading-none">
              Internal Team Chat &middot; Phase 4: Realtime Chat Core
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <HealthBadge />
          <ThemeToggle />
        </div>
      </header>

      {/* Main View Area */}
      <div className="flex-1 flex flex-col">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex items-center gap-2 text-xs text-content-muted font-mono">
              <span className="w-2 h-2 rounded-full bg-accent animate-ping" />
              <span>Checking session...</span>
            </div>
          </div>
        ) : isAuthenticated ? (
          <DashboardShell />
        ) : (
          <LoginPage />
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-border bg-panel py-3 px-4 text-center text-xs text-content-muted">
        Relay &copy; {new Date().getFullYear()} Acme Labs &middot; Clean SPA Architecture &middot; Portfolio Demo Edition
      </footer>
    </div>
  );
};

export default App;
