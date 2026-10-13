import React, { useState } from 'react';
import { ShieldCheck, UserCheck, Lock, Mail, AlertCircle, ArrowRight, Loader2 } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { useAuthStore, UserSummary } from '../../store/authStore';

export const LoginPage: React.FC = () => {
  const { setAuth } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState<'admin' | 'employee' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleManualLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ access_token: string; user: UserSummary }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setAuth(data.user, data.access_token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async (target: 'admin' | 'employee') => {
    setDemoLoading(target);
    setError(null);
    try {
      const data = await apiFetch<{ access_token: string; user: UserSummary }>('/auth/demo-login', {
        method: 'POST',
        body: JSON.stringify({ target }),
      });
      setAuth(data.user, data.access_token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Demo login failed');
    } finally {
      setDemoLoading(null);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto my-auto p-4">
      {/* Demo Guardrail Banner (§0 Demo Guardrails) */}
      <div className="mb-4 px-3 py-2 rounded-lg bg-panel border border-border flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-content-secondary font-medium">
          <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
          Demo environment &mdash; data resets daily
        </span>
        <span className="font-mono text-[10px] text-content-muted">Acme Labs</span>
      </div>

      <div className="bg-panel border border-border rounded-2xl p-6 sm:p-8 shadow-sm">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-10 h-10 rounded-xl bg-accent text-white font-bold text-lg flex items-center justify-center mx-auto mb-3 shadow-sm">
            R
          </div>
          <h1 className="text-xl font-bold tracking-tight text-content-primary">Sign in to Relay</h1>
          <p className="text-xs text-content-secondary mt-1">
            Internal team communication for Acme Labs
          </p>
        </div>

        {error && (
          <div className="mb-5 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-status-dnd text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Section 1: One-Click Demo Logins (§0) */}
        <div className="space-y-2.5 mb-6">
          <p className="text-[11px] font-semibold text-content-muted uppercase tracking-wider text-center">
            Instant Demo Access
          </p>

          <button
            type="button"
            onClick={() => handleDemoLogin('admin')}
            disabled={loading || demoLoading !== null}
            className="w-full py-2.5 px-4 rounded-xl bg-elevated hover:bg-floor border border-border text-xs font-medium text-content-primary flex items-center justify-between transition-all duration-150 active:scale-[0.98] shadow-sm group disabled:opacity-50"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-accent/10 text-accent flex items-center justify-center">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div className="text-left">
                <p className="font-semibold text-content-primary leading-tight">Try as Admin</p>
                <p className="text-[10px] text-content-muted">Alex Morgan &middot; Main-Admin</p>
              </div>
            </div>
            {demoLoading === 'admin' ? (
              <Loader2 className="w-4 h-4 animate-spin text-accent" />
            ) : (
              <ArrowRight className="w-4 h-4 text-content-muted group-hover:text-content-primary group-hover:translate-x-0.5 transition-all" />
            )}
          </button>

          <button
            type="button"
            onClick={() => handleDemoLogin('employee')}
            disabled={loading || demoLoading !== null}
            className="w-full py-2.5 px-4 rounded-xl bg-elevated hover:bg-floor border border-border text-xs font-medium text-content-primary flex items-center justify-between transition-all duration-150 active:scale-[0.98] shadow-sm group disabled:opacity-50"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-panel border border-border text-content-secondary flex items-center justify-center">
                <UserCheck className="w-4 h-4" />
              </div>
              <div className="text-left">
                <p className="font-semibold text-content-primary leading-tight">Try as Employee</p>
                <p className="text-[10px] text-content-muted">Sam Rivera &middot; Team AI</p>
              </div>
            </div>
            {demoLoading === 'employee' ? (
              <Loader2 className="w-4 h-4 animate-spin text-accent" />
            ) : (
              <ArrowRight className="w-4 h-4 text-content-muted group-hover:text-content-primary group-hover:translate-x-0.5 transition-all" />
            )}
          </button>
        </div>

        {/* Divider */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-[10px] uppercase font-mono">
            <span className="bg-panel px-2 text-content-muted">or continue with email</span>
          </div>
        </div>

        {/* Section 2: Email & Password Form */}
        <form onSubmit={handleManualLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-content-secondary mb-1">
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-content-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@acme.demo"
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-elevated border border-border text-xs text-content-primary placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-content-secondary mb-1">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-content-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-elevated border border-border text-xs text-content-primary placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || demoLoading !== null}
            className="w-full py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all duration-150 active:scale-[0.98] shadow-sm disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <span>Sign In</span>
            )}
          </button>
        </form>
      </div>

      <p className="text-center text-[11px] text-content-muted mt-4">
        No self-registration &middot; Provisioned by Main-Admin only
      </p>
    </div>
  );
};
