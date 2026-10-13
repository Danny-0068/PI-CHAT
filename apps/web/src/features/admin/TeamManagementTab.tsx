import React, { useState } from 'react';
import { 
  Users, 
  Crown, 
  HardDrive, 
  Plus, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Sliders
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { Team, useTeamStore } from '../../store/teamStore';

interface TeamManagementTabProps {
  teams: Team[];
  onTeamCreatedOrUpdated?: () => void;
}

export const TeamManagementTab: React.FC<TeamManagementTabProps> = ({ 
  teams, 
  onTeamCreatedOrUpdated 
}) => {
  const { updateTeamLimit } = useTeamStore();
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean } | null>(null);
  const [editingLimitTeamId, setEditingLimitTeamId] = useState<string | null>(null);
  const [limitMb, setLimitMb] = useState<number>(10);
  const [limitSaving, setLimitSaving] = useState(false);

  // New team form state
  const [isCreatingTeam, setIsCreatingTeam] = useState(false);
  const [newTeamSlug, setNewTeamSlug] = useState('');
  const [newTeamDisplayName, setNewTeamDisplayName] = useState('');
  const [newTeamColor, setNewTeamColor] = useState('#6366F1');
  const [newTeamLimitMb, setNewTeamLimitMb] = useState(10);
  const [isSubmittingNewTeam, setIsSubmittingNewTeam] = useState(false);

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return 'Demo Default (10 MB)';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(0)} MB`;
  };

  const handleSaveLimit = async (teamId: string) => {
    setLimitSaving(true);
    setFeedback(null);
    try {
      const bytes = limitMb * 1024 * 1024;
      await updateTeamLimit(teamId, bytes);
      setFeedback({ text: `Team file size limit set to ${limitMb} MB.` });
      setEditingLimitTeamId(null);
      if (onTeamCreatedOrUpdated) onTeamCreatedOrUpdated();
    } catch (err) {
      setFeedback({ 
        text: err instanceof Error ? err.message : 'Failed to update limit', 
        error: true 
      });
    } finally {
      setLimitSaving(false);
    }
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamSlug.trim() || !newTeamDisplayName.trim()) return;

    setIsSubmittingNewTeam(true);
    setFeedback(null);
    try {
      await apiFetch('/admin/teams', {
        method: 'POST',
        body: JSON.stringify({
          name: newTeamSlug.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'),
          display_name: newTeamDisplayName.trim(),
          color: newTeamColor,
          file_size_limit_bytes: newTeamLimitMb * 1024 * 1024,
        }),
      });
      setFeedback({ text: `Created team tag '${newTeamDisplayName}' successfully.` });
      setIsCreatingTeam(false);
      setNewTeamSlug('');
      setNewTeamDisplayName('');
      if (onTeamCreatedOrUpdated) onTeamCreatedOrUpdated();
    } catch (err) {
      setFeedback({ 
        text: err instanceof Error ? err.message : 'Failed to create team', 
        error: true 
      });
    } finally {
      setIsSubmittingNewTeam(false);
    }
  };

  return (
    <div className="space-y-5">
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
          <h4 className="text-sm font-semibold text-content-primary">Department & Team Structure</h4>
          <p className="text-xs text-content-muted">Configure seed departments, colors, and storage limits.</p>
        </div>
        <button
          onClick={() => setIsCreatingTeam(!isCreatingTeam)}
          className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-hover flex items-center gap-1.5 transition-colors shadow-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Team Tag</span>
        </button>
      </div>

      {/* New Team Modal / Form */}
      {isCreatingTeam && (
        <form 
          onSubmit={handleCreateTeam}
          className="p-4 rounded-xl border border-accent/30 bg-accent-subtle/30 space-y-3"
        >
          <div className="flex items-center gap-2 text-xs font-semibold text-accent">
            <Plus className="w-4 h-4" />
            <span>Create New Department Tag</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-content-secondary mb-1">
                Display Name
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Design & Creative"
                value={newTeamDisplayName}
                onChange={(e) => setNewTeamDisplayName(e.target.value)}
                className="w-full text-xs px-3 py-1.5 rounded-lg border border-border bg-panel text-content-primary focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-content-secondary mb-1">
                Tag Slug (e.g. team_design)
              </label>
              <input
                type="text"
                required
                placeholder="slug_identifier"
                value={newTeamSlug}
                onChange={(e) => setNewTeamSlug(e.target.value)}
                className="w-full text-xs px-3 py-1.5 rounded-lg border border-border bg-panel text-content-primary font-mono focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-content-secondary mb-1">
                Tag Color
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={newTeamColor}
                  onChange={(e) => setNewTeamColor(e.target.value)}
                  className="w-8 h-8 rounded border border-border cursor-pointer bg-transparent"
                />
                <input
                  type="text"
                  value={newTeamColor}
                  onChange={(e) => setNewTeamColor(e.target.value)}
                  className="text-xs px-2 py-1.5 rounded-lg border border-border bg-panel font-mono text-content-primary w-28 uppercase"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-content-secondary mb-1">
                File Size Limit ({newTeamLimitMb} MB)
              </label>
              <input
                type="range"
                min="5"
                max="50"
                value={newTeamLimitMb}
                onChange={(e) => setNewTeamLimitMb(Number(e.target.value))}
                className="w-full accent-accent"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsCreatingTeam(false)}
              className="px-3 py-1.5 text-xs text-content-muted hover:text-content-primary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmittingNewTeam}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
            >
              {isSubmittingNewTeam ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Create Team'}
            </button>
          </div>
        </form>
      )}

      {/* Team Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {teams.map((team) => {
          const isEditingLimit = editingLimitTeamId === team.id;

          return (
            <div
              key={team.id}
              className="p-4 rounded-xl border border-border bg-panel flex flex-col justify-between gap-3 shadow-xs"
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3.5 h-3.5 rounded-full shadow-xs"
                      style={{ backgroundColor: team.color }}
                    />
                    <h5 className="text-xs font-bold text-content-primary">{team.display_name}</h5>
                  </div>
                  <span className="text-[10px] font-mono text-content-muted">#{team.name}</span>
                </div>

                <div className="flex items-center gap-3 text-xs text-content-secondary">
                  <div className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5 text-content-muted" />
                    <span>{team.active_member_count} member{team.active_member_count === 1 ? '' : 's'}</span>
                  </div>
                  {team.lead_names.length > 0 && (
                    <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                      <Crown className="w-3.5 h-3.5" />
                      <span>{team.lead_names.join(', ')}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* File Limit Control */}
              <div className="pt-2 border-t border-border flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 text-content-muted">
                  <HardDrive className="w-3.5 h-3.5" />
                  <span>Limit:</span>
                  <span className="font-mono font-medium text-content-primary">
                    {formatFileSize(team.file_size_limit_bytes)}
                  </span>
                </div>

                {!isEditingLimit ? (
                  <button
                    onClick={() => {
                      setEditingLimitTeamId(team.id);
                      const currentMb = team.file_size_limit_bytes
                        ? Math.round(team.file_size_limit_bytes / (1024 * 1024))
                        : 10;
                      setLimitMb(currentMb);
                    }}
                    className="text-[11px] px-2 py-0.5 rounded border border-border bg-elevated hover:bg-floor text-content-secondary flex items-center gap-1 transition-colors"
                  >
                    <Sliders className="w-3 h-3" />
                    <span>Change</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="range"
                      min="5"
                      max="100"
                      value={limitMb}
                      onChange={(e) => setLimitMb(Number(e.target.value))}
                      className="w-20 accent-accent"
                    />
                    <span className="font-mono text-[11px] font-semibold text-content-primary w-8">
                      {limitMb}M
                    </span>
                    <button
                      disabled={limitSaving}
                      onClick={() => handleSaveLimit(team.id)}
                      className="px-2 py-0.5 text-[10px] rounded bg-accent text-white font-medium hover:bg-accent-hover transition-colors disabled:opacity-50"
                    >
                      {limitSaving ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : 'Set'}
                    </button>
                    <button
                      onClick={() => setEditingLimitTeamId(null)}
                      className="text-[10px] text-content-muted hover:text-content-primary"
                    >
                      X
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
