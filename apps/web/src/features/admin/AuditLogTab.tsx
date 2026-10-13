import React, { useEffect, useState } from 'react';
import { 
  RefreshCw, 
  Loader2, 
  AlertCircle, 
  Filter 
} from 'lucide-react';
import { apiFetch } from '../../lib/api';

export interface AuditLogItem {
  id: string;
  actor_id: string | null;
  actor_email: string;
  action: string;
  target_type: string;
  target_id: string | null;
  details: Record<string, any>;
  created_at: string;
}

export const AuditLogTab: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterAction, setFilterAction] = useState<string>('ALL');

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const url = filterAction === 'ALL' 
        ? '/admin/audit-logs?limit=50' 
        : `/admin/audit-logs?limit=50&action=${encodeURIComponent(filterAction)}`;
      const data = await apiFetch<AuditLogItem[]>(url);
      setLogs(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch audit logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [filterAction]);

  const getActionColor = (action: string) => {
    if (action.includes('LOGOUT') || action.includes('DEACTIVATED')) {
      return 'bg-status-dnd/10 text-status-dnd border-status-dnd/20';
    }
    if (action.includes('TEAM') || action.includes('ASSIGNED')) {
      return 'bg-accent-subtle text-accent border-accent/20';
    }
    if (action.includes('LIMIT')) {
      return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
    }
    return 'bg-elevated text-content-secondary border-border';
  };

  const formatTimestamp = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-content-primary">System Audit Trail</h4>
          <p className="text-xs text-content-muted">Tamper-evident record of administrative and membership actions.</p>
        </div>

        <div className="flex items-center gap-2">
          {/* Action Filter */}
          <div className="flex items-center gap-1.5 text-xs bg-elevated border border-border rounded-lg px-2 py-1">
            <Filter className="w-3 h-3 text-content-muted" />
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="bg-transparent text-xs text-content-primary focus:outline-none"
            >
              <option value="ALL">All Events</option>
              <option value="USER_ASSIGNED_TO_TEAM">Team Assigned</option>
              <option value="TEAM_LEAD_STATUS_CHANGED">Lead Changed</option>
              <option value="TEAM_LIMIT_UPDATED">Limit Updated</option>
              <option value="TEAM_CREATED">Team Created</option>
              <option value="FORCE_LOGOUT_ALL_SESSIONS">Force Logout</option>
            </select>
          </div>

          <button
            onClick={fetchLogs}
            disabled={loading}
            className="p-1.5 rounded-lg border border-border bg-panel hover:bg-elevated text-content-secondary transition-colors"
            title="Refresh Audit Logs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg text-xs flex items-center gap-2 bg-status-dnd/10 text-status-dnd border border-status-dnd/20">
          <AlertCircle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      )}

      {loading && logs.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-xs text-content-muted gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Loading audit log entries...</span>
        </div>
      ) : logs.length === 0 ? (
        <div className="border border-border rounded-xl p-8 text-center bg-panel text-content-muted text-xs">
          No audit log events found matching the filter.
        </div>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden bg-panel">
          <div className="divide-y divide-border">
            {logs.map((log) => (
              <div key={log.id} className="p-3 hover:bg-elevated/40 transition-colors space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded border ${getActionColor(log.action)}`}>
                      {log.action}
                    </span>
                    <span className="text-xs font-mono font-medium text-content-primary">
                      {log.actor_email}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-content-muted">
                    {formatTimestamp(log.created_at)}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-[11px] text-content-secondary">
                  <span className="text-content-muted">Target:</span>
                  <span className="font-mono text-content-primary bg-floor px-1.5 py-0.2 rounded border border-border">
                    {log.target_type} {log.target_id ? `(${log.target_id.slice(0, 8)}...)` : ''}
                  </span>
                </div>

                {log.details && Object.keys(log.details).length > 0 && (
                  <pre className="text-[11px] font-mono bg-floor/80 p-2 rounded-lg border border-border/80 text-content-secondary overflow-x-auto">
                    {JSON.stringify(log.details, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
