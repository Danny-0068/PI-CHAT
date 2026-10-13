import React, { useEffect, useState } from 'react';
import { 
  Crown, 
  LogOut, 
  Key, 
  AlertCircle, 
  CheckCircle2, 
  Loader2, 
  ShieldCheck, 
  UserCheck,
  RefreshCw
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { Team } from '../../store/teamStore';
import { SudoModal } from '../auth/SudoModal';

export interface AdminUser {
  id: string;
  email: string;
  display_name: string;
  role: 'MAIN_ADMIN' | 'EMPLOYEE';
  status: 'AVAILABLE' | 'AWAY' | 'DND';
  status_text: string | null;
  is_active: boolean;
  is_demo: boolean;
  force_password_change: boolean;
  team: {
    id: string;
    name: string;
    display_name: string;
    color: string;
    is_lead: boolean;
  } | null;
  created_at: string;
  updated_at: string;
}

interface UserManagementTabProps {
  teams: Team[];
  onTeamUpdated?: () => void;
}

export const UserManagementTab: React.FC<UserManagementTabProps> = ({ teams, onTeamUpdated }) => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean } | null>(null);

  // Sudo step-up state for resetting another admin's password
  const [sudoTargetUserId, setSudoTargetUserId] = useState<string | null>(null);
  const [isSudoModalOpen, setIsSudoModalOpen] = useState(false);
  const [resetModalResult, setResetModalResult] = useState<{ email: string; pass: string } | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const data = await apiFetch<AdminUser[]>('/admin/users');
      setUsers(data);
    } catch (err) {
      setFeedback({ 
        text: err instanceof Error ? err.message : 'Failed to fetch users', 
        error: true 
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleAssignTeam = async (userId: string, newTeamId: string) => {
    setActionLoading((prev) => ({ ...prev, [userId]: true }));
    setFeedback(null);
    try {
      const teamIdVal = newTeamId === 'none' ? null : newTeamId;
      await apiFetch(`/admin/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ team_id: teamIdVal, is_lead: false }),
      });
      setFeedback({ text: 'Team assignment updated successfully.' });
      await fetchUsers();
      if (onTeamUpdated) onTeamUpdated();
    } catch (err) {
      setFeedback({ 
        text: err instanceof Error ? err.message : 'Failed to update team assignment', 
        error: true 
      });
    } finally {
      setActionLoading((prev) => ({ ...prev, [userId]: false }));
    }
  };

  const handleToggleLead = async (user: AdminUser) => {
    if (!user.team) return;
    setActionLoading((prev) => ({ ...prev, [user.id]: true }));
    setFeedback(null);
    try {
      await apiFetch(`/admin/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_lead: !user.team.is_lead }),
      });
      setFeedback({ 
        text: `Team lead status ${!user.team.is_lead ? 'granted' : 'removed'} for ${user.display_name}.` 
      });
      await fetchUsers();
      if (onTeamUpdated) onTeamUpdated();
    } catch (err) {
      setFeedback({ 
        text: err instanceof Error ? err.message : 'Failed to toggle lead status', 
        error: true 
      });
    } finally {
      setActionLoading((prev) => ({ ...prev, [user.id]: false }));
    }
  };

  const handleForceLogout = async (userId: string, userEmail: string) => {
    if (!confirm(`Are you sure you want to force logout all active sessions for ${userEmail}?`)) return;
    setActionLoading((prev) => ({ ...prev, [userId]: true }));
    setFeedback(null);
    try {
      await apiFetch(`/admin/users/${userId}/force-logout`, { method: 'POST' });
      setFeedback({ text: `Revoked all active sessions for ${userEmail}.` });
    } catch (err) {
      setFeedback({ 
        text: err instanceof Error ? err.message : 'Failed to force logout user', 
        error: true 
      });
    } finally {
      setActionLoading((prev) => ({ ...prev, [userId]: false }));
    }
  };

  const handleResetPassword = async (targetUser: AdminUser, sudoToken?: string) => {
    setActionLoading((prev) => ({ ...prev, [targetUser.id]: true }));
    setFeedback(null);
    try {
      const res = await apiFetch<{ email: string; new_password: string }>(
        `/users/${targetUser.id}/reset-password`,
        {
          method: 'POST',
          sudoToken,
        }
      );
      setResetModalResult({ email: res.email, pass: res.new_password });
    } catch (err) {
      if (err instanceof Error && err.message.toLowerCase().includes('sudo')) {
        setSudoTargetUserId(targetUser.id);
        setIsSudoModalOpen(true);
      } else {
        setFeedback({ 
          text: err instanceof Error ? err.message : 'Failed to reset password', 
          error: true 
        });
      }
    } finally {
      setActionLoading((prev) => ({ ...prev, [targetUser.id]: false }));
    }
  };

  const handleSudoSuccess = async (token: string) => {
    if (!sudoTargetUserId) return;
    const target = users.find((u) => u.id === sudoTargetUserId);
    if (target) {
      await handleResetPassword(target, token);
    }
    setSudoTargetUserId(null);
  };

  return (
    <div className="space-y-4">
      {/* Sudo Modal for Admin Password Reset */}
      <SudoModal
        isOpen={isSudoModalOpen}
        onClose={() => {
          setIsSudoModalOpen(false);
          setSudoTargetUserId(null);
        }}
        onSuccess={handleSudoSuccess}
        actionTitle="Reset Administrator Password"
      />

      {/* Password Reset Result Notification */}
      {resetModalResult && (
        <div className="p-4 rounded-xl bg-accent-subtle border border-accent/30 space-y-2">
          <div className="flex items-center gap-2 text-accent font-semibold text-xs">
            <CheckCircle2 className="w-4 h-4" />
            <span>New Temporary Password Generated</span>
          </div>
          <p className="text-xs text-content-secondary">
            User <span className="font-mono font-medium text-content-primary">{resetModalResult.email}</span> must change their password on next sign-in.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={resetModalResult.pass}
              className="px-3 py-1.5 text-xs font-mono font-bold bg-panel border border-border rounded-lg text-content-primary select-all w-64"
            />
            <button
              onClick={() => {
                navigator.clipboard.writeText(resetModalResult.pass);
                setFeedback({ text: 'Copied new temporary password to clipboard.' });
              }}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors"
            >
              Copy
            </button>
            <button
              onClick={() => setResetModalResult(null)}
              className="text-xs text-content-muted hover:text-content-primary px-2"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {feedback && (
        <div className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
          feedback.error 
            ? 'bg-status-dnd/10 text-status-dnd border border-status-dnd/20' 
            : 'bg-status-available/10 text-status-available border border-status-available/20'
        }`}>
          {feedback.error ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
          <span>{feedback.text}</span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-content-primary">User Directory & Roles</h4>
          <p className="text-xs text-content-muted">Manage department assignments, team lead status, and security actions.</p>
        </div>
        <button
          onClick={fetchUsers}
          disabled={loading}
          className="p-1.5 rounded-lg border border-border bg-panel hover:bg-elevated text-content-secondary transition-colors"
          title="Refresh User Directory"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading && users.length === 0 ? (
        <div className="flex items-center justify-center py-10 text-xs text-content-muted gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Loading user directory...</span>
        </div>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden bg-panel">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-elevated/70 border-b border-border text-content-muted font-medium uppercase tracking-wider text-[10px]">
                  <th className="py-2.5 px-3">User</th>
                  <th className="py-2.5 px-3">Role</th>
                  <th className="py-2.5 px-3">Department Tag</th>
                  <th className="py-2.5 px-3 text-center">Lead Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map((u) => {
                  const isBusy = !!actionLoading[u.id];

                  return (
                    <tr key={u.id} className="hover:bg-elevated/30 transition-colors">
                      {/* Name / Email */}
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-elevated border border-border flex items-center justify-center font-bold text-xs text-content-primary flex-shrink-0">
                            {u.display_name.split(' ').map((n) => n[0]).join('')}
                          </div>
                          <div>
                            <div className="font-semibold text-content-primary flex items-center gap-1.5">
                              <span>{u.display_name}</span>
                              {u.is_demo && (
                                <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-floor text-content-muted border border-border">
                                  demo
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] font-mono text-content-muted">{u.email}</div>
                          </div>
                        </div>
                      </td>

                      {/* System Role */}
                      <td className="py-2.5 px-3">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-mono font-medium px-2 py-0.5 rounded-full ${
                          u.role === 'MAIN_ADMIN'
                            ? 'bg-accent-subtle text-accent border border-accent/20'
                            : 'bg-elevated text-content-secondary border border-border'
                        }`}>
                          {u.role === 'MAIN_ADMIN' ? <ShieldCheck className="w-2.5 h-2.5" /> : <UserCheck className="w-2.5 h-2.5" />}
                          {u.role}
                        </span>
                      </td>

                      {/* Team Assignment Select */}
                      <td className="py-2.5 px-3">
                        <select
                          disabled={isBusy}
                          value={u.team?.id ?? 'none'}
                          onChange={(e) => handleAssignTeam(u.id, e.target.value)}
                          className="text-xs bg-elevated border border-border rounded-md px-2 py-1 text-content-primary focus:outline-none focus:ring-1 focus:ring-accent"
                        >
                          <option value="none">No Department</option>
                          {teams.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.display_name} ({t.name})
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Lead Status Toggle */}
                      <td className="py-2.5 px-3 text-center">
                        {u.team ? (
                          <button
                            disabled={isBusy}
                            onClick={() => handleToggleLead(u)}
                            className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md font-medium transition-colors ${
                              u.team.is_lead
                                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                                : 'bg-elevated text-content-muted hover:text-content-secondary border border-border'
                            }`}
                            title="Toggle department lead status"
                          >
                            <Crown className="w-3 h-3" />
                            <span>{u.team.is_lead ? 'Lead' : 'Member'}</span>
                          </button>
                        ) : (
                          <span className="text-[10px] text-content-muted italic">—</span>
                        )}
                      </td>

                      {/* Security Actions */}
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            disabled={isBusy}
                            onClick={() => handleForceLogout(u.id, u.email)}
                            className="p-1 rounded text-content-muted hover:text-status-dnd hover:bg-floor border border-transparent hover:border-border transition-colors"
                            title="Force Logout All Sessions"
                          >
                            <LogOut className="w-3.5 h-3.5" />
                          </button>

                          <button
                            disabled={isBusy}
                            onClick={() => handleResetPassword(u)}
                            className="p-1 rounded text-content-muted hover:text-accent hover:bg-floor border border-transparent hover:border-border transition-colors"
                            title={u.role === 'MAIN_ADMIN' ? 'Reset Password (Requires Sudo)' : 'Reset Password'}
                          >
                            <Key className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
