import React, { useEffect, useState } from 'react';
import { 
  ChevronRight, 
  Users, 
  Crown, 
  HardDrive, 
  Sliders, 
  Loader2,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { useTeamStore, Team } from '../store/teamStore';
import { useAuthStore } from '../store/authStore';

interface TeamsAccordionProps {
  onOpenAdminTeamTab?: () => void;
  onStartDM?: (userId: string) => void;
}

export const TeamsAccordion: React.FC<TeamsAccordionProps> = ({ onOpenAdminTeamTab, onStartDM }) => {
  const { teams, loading, fetchTeams, fetchTeamDetail, teamDetails, updateTeamLimit } = useTeamStore();
  const { user } = useAuthStore();
  const [expandedTeams, setExpandedTeams] = useState<Record<string, boolean>>({});
  const [editingLimitTeamId, setEditingLimitTeamId] = useState<string | null>(null);
  const [limitMb, setLimitMb] = useState<number>(10);
  const [limitUpdating, setLimitUpdating] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ id: string; text: string; error?: boolean } | null>(null);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  const toggleExpand = async (teamId: string) => {
    const isExpanding = !expandedTeams[teamId];
    setExpandedTeams((prev) => ({ ...prev, [teamId]: isExpanding }));
    if (isExpanding && !teamDetails[teamId]) {
      await fetchTeamDetail(teamId);
    }
  };

  const isUserTeamLead = (team: Team) => {
    if (!user) return false;
    if (user.role === 'MAIN_ADMIN') return true;
    return team.lead_names.includes(user.display_name);
  };

  const handleSaveLimit = async (teamId: string) => {
    setLimitUpdating(true);
    setFeedbackMsg(null);
    try {
      const bytes = limitMb * 1024 * 1024;
      await updateTeamLimit(teamId, bytes);
      setFeedbackMsg({ id: teamId, text: `File limit updated to ${limitMb} MB` });
      setEditingLimitTeamId(null);
    } catch (err) {
      setFeedbackMsg({ 
        id: teamId, 
        text: err instanceof Error ? err.message : 'Failed to update limit', 
        error: true 
      });
    } finally {
      setLimitUpdating(false);
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return 'Demo Default (10 MB)';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(0)} MB`;
  };

  return (
    <div className="bg-panel border border-border rounded-xl p-4 shadow-sm flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-accent" />
          <h3 className="text-sm font-semibold text-content-primary">Teams & Departments</h3>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-elevated text-content-secondary border border-border">
            {teams.length}
          </span>
        </div>
        {user?.role === 'MAIN_ADMIN' && onOpenAdminTeamTab && (
          <button
            onClick={onOpenAdminTeamTab}
            className="text-[11px] font-medium text-accent hover:underline flex items-center gap-1"
          >
            <span>Manage All</span>
          </button>
        )}
      </div>

      {loading && teams.length === 0 ? (
        <div className="flex items-center justify-center py-6 text-content-muted text-xs gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Loading teams...</span>
        </div>
      ) : (
        <div className="space-y-2">
          {teams.map((team) => {
            const isExpanded = !!expandedTeams[team.id];
            const details = teamDetails[team.id];
            const canEdit = isUserTeamLead(team);
            const isEditingLimit = editingLimitTeamId === team.id;

            return (
              <div 
                key={team.id}
                className="border border-border/80 rounded-lg overflow-hidden bg-elevated/40 transition-colors"
              >
                {/* Header Row */}
                <div 
                  onClick={() => toggleExpand(team.id)}
                  className="flex items-center justify-between p-3 cursor-pointer hover:bg-elevated/70 active:scale-[0.99] select-none transition-all duration-150"
                >
                  <div className="flex items-center gap-2.5">
                    <span 
                      className="w-3 h-3 rounded-full flex-shrink-0 shadow-xs" 
                      style={{ backgroundColor: team.color }}
                      title={`Team Tag: ${team.color}`}
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-content-primary">
                          {team.display_name}
                        </span>
                        <span className="text-[10px] font-mono text-content-muted">
                          #{team.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-content-secondary">
                          {team.active_member_count} member{team.active_member_count === 1 ? '' : 's'}
                        </span>
                        {team.lead_names.length > 0 && (
                          <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400 flex items-center gap-0.5">
                            <Crown className="w-3 h-3" />
                            {team.lead_names.join(', ')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="hidden sm:inline-flex text-[10px] font-mono text-content-muted items-center gap-1 bg-floor px-1.5 py-0.5 rounded border border-border">
                      <HardDrive className="w-2.5 h-2.5" />
                      {formatFileSize(team.file_size_limit_bytes)}
                    </span>
                    <ChevronRight 
                      className={`w-4 h-4 text-content-muted transition-transform duration-200 ease-out ${
                        isExpanded ? 'rotate-90 text-content-primary' : ''
                      }`} 
                    />
                  </div>
                </div>

                {/* Expanded Details Body */}
                {isExpanded && (
                  <div className="px-3 pb-3 pt-1 border-t border-border/60 bg-floor/60 space-y-3">
                    {/* File Limit & Lead Controls */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 text-xs">
                      <div className="flex items-center gap-1.5 text-content-secondary">
                        <HardDrive className="w-3.5 h-3.5 text-content-muted" />
                        <span>File Limit:</span>
                        <span className="font-mono font-medium text-content-primary">
                          {formatFileSize(team.file_size_limit_bytes)}
                        </span>
                      </div>

                      {canEdit && (
                        <div className="flex items-center gap-2">
                          {!isEditingLimit ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingLimitTeamId(team.id);
                                const currentMb = team.file_size_limit_bytes 
                                  ? Math.round(team.file_size_limit_bytes / (1024 * 1024)) 
                                  : 10;
                                setLimitMb(currentMb);
                              }}
                              className="text-[11px] px-2 py-0.5 rounded border border-border bg-elevated hover:bg-panel text-content-secondary flex items-center gap-1 transition-colors"
                            >
                              <Sliders className="w-3 h-3" />
                              <span>Adjust Limit</span>
                            </button>
                          ) : (
                            <div className="flex items-center gap-2 bg-panel p-2 rounded-lg border border-border" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="range"
                                  min="5"
                                  max={user?.role === 'MAIN_ADMIN' ? 50 : 25}
                                  value={limitMb}
                                  onChange={(e) => setLimitMb(Number(e.target.value))}
                                  className="w-24 accent-accent"
                                />
                                <span className="font-mono text-xs font-semibold text-content-primary w-10">
                                  {limitMb}MB
                                </span>
                              </div>
                              <button
                                disabled={limitUpdating}
                                onClick={() => handleSaveLimit(team.id)}
                                className="px-2 py-0.5 text-[11px] rounded bg-accent text-white font-medium hover:bg-accent-hover transition-colors disabled:opacity-50"
                              >
                                {limitUpdating ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
                              </button>
                              <button
                                onClick={() => setEditingLimitTeamId(null)}
                                className="px-1.5 py-0.5 text-[11px] rounded text-content-muted hover:text-content-primary"
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {feedbackMsg && feedbackMsg.id === team.id && (
                      <div className={`text-[11px] p-2 rounded flex items-center gap-1.5 ${
                        feedbackMsg.error 
                          ? 'bg-status-dnd/10 text-status-dnd border border-status-dnd/20' 
                          : 'bg-status-available/10 text-status-available border border-status-available/20'
                      }`}>
                        {feedbackMsg.error ? <AlertCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        <span>{feedbackMsg.text}</span>
                      </div>
                    )}

                    {/* Member Roster Scoping */}
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-medium text-content-muted uppercase tracking-wider">
                        Active Members ({details?.members?.length ?? team.active_member_count})
                      </div>
                      
                      {!details ? (
                        <div className="flex items-center gap-2 text-xs text-content-muted py-2">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>Fetching member roster...</span>
                        </div>
                      ) : details.members.length === 0 ? (
                        <p className="text-xs text-content-muted italic py-1">No active members assigned yet.</p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                          {details.members.map((mem) => (
                            <button 
                              key={mem.user_id}
                              onClick={() => {
                                if (onStartDM && mem.user_id !== user?.id) {
                                  onStartDM(mem.user_id);
                                }
                              }}
                              disabled={mem.user_id === user?.id}
                              title={mem.user_id === user?.id ? 'This is you' : `Message ${mem.display_name}`}
                              className={`flex items-center justify-between p-2 rounded bg-panel border border-border/70 text-xs text-left transition-colors ${
                                mem.user_id !== user?.id ? 'hover:bg-floor hover:border-accent/40 cursor-pointer' : 'opacity-80 cursor-default'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="w-6 h-6 rounded-full bg-elevated border border-border flex items-center justify-center font-bold text-[10px] text-content-primary shrink-0">
                                  {mem.display_name.split(' ').map(n => n[0]).join('')}
                                </div>
                                <div className="truncate">
                                  <div className="font-medium text-content-primary truncate flex items-center gap-1.5">
                                    <span>{mem.display_name}</span>
                                    {mem.user_id === user?.id && (
                                      <span className="text-[9px] text-content-muted font-normal">(you)</span>
                                    )}
                                  </div>
                                  <div className="text-[10px] font-mono text-content-muted truncate">
                                    {mem.email}
                                  </div>
                                </div>
                              </div>

                              {mem.is_lead && (
                                <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.2 rounded flex items-center gap-1 flex-shrink-0 ml-2">
                                  <Crown className="w-2.5 h-2.5" />
                                  Lead
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
