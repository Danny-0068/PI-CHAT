import React, { useEffect, useState } from 'react';
import { Activity, CheckCircle2, AlertCircle } from 'lucide-react';

interface HealthData {
  status: string;
  app: string;
  env: string;
  version: string;
}

export const HealthBadge: React.FC = () => {
  const [data, setData] = useState<HealthData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';

  const checkHealth = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/health`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, [apiUrl]);

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-panel border border-border text-xs font-mono">
      <div className="flex items-center gap-1.5">
        <Activity className="w-3.5 h-3.5 text-content-secondary" />
        <span className="text-content-secondary font-sans font-medium">API:</span>
      </div>

      {loading && !data && !error && (
        <span className="text-content-muted">Connecting...</span>
      )}

      {data && (
        <div className="flex items-center gap-1.5 text-status-available">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span className="font-medium">{data.app} v{data.version} ({data.env})</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-1.5 text-status-dnd" title={error}>
          <AlertCircle className="w-3.5 h-3.5" />
          <span>Offline ({error})</span>
        </div>
      )}

      <button
        onClick={checkHealth}
        className="ml-1 text-[10px] text-content-muted hover:text-content-primary underline"
        title="Retry connection"
      >
        retry
      </button>
    </div>
  );
};
