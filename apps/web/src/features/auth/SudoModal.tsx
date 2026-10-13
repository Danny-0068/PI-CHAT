import React, { useState } from 'react';
import { ShieldAlert, X, Lock, Loader2, AlertCircle } from 'lucide-react';
import { apiFetch } from '../../lib/api';

interface SudoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (sudoToken: string) => void;
  actionTitle?: string;
}

export const SudoModal: React.FC<SudoModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  actionTitle = 'Sensitive Admin Action',
}) => {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;

    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ sudo_token: string }>('/auth/sudo', {
        method: 'POST',
        body: JSON.stringify({ password }),
      });
      onSuccess(data.sudo_token);
      setPassword('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sudo verification failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="w-full max-w-sm rounded-2xl bg-panel border border-border p-6 shadow-xl relative animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-content-muted hover:text-content-primary p-1 rounded-md"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-status-away/10 text-status-away flex items-center justify-center">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-content-primary">Sudo Step-Up Required</h2>
            <p className="text-[11px] text-content-muted">Re-enter your password to proceed</p>
          </div>
        </div>

        <p className="text-xs text-content-secondary mb-4">
          You are attempting to execute: <strong className="text-content-primary">{actionTitle}</strong>. 
          Confirming your identity grants a 5-minute elevated session.
        </p>

        {error && (
          <div className="mb-4 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-status-dnd text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-content-secondary mb-1">
              Admin Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-content-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                autoFocus
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your current password"
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-elevated border border-border text-xs text-content-primary placeholder:text-content-muted focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-content-secondary hover:bg-floor transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !password}
              className="px-4 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <span>Authorize Action</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
