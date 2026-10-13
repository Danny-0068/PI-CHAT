import React, { useState, useEffect } from 'react';
import { 
  X, 
  Users, 
  ShieldCheck, 
  Layers, 
  FileText 
} from 'lucide-react';
import { useTeamStore } from '../../store/teamStore';
import { UserManagementTab } from './UserManagementTab';
import { TeamManagementTab } from './TeamManagementTab';
import { AuditLogTab } from './AuditLogTab';

interface AdminDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'users' | 'teams' | 'audit';
}

export const AdminDrawer: React.FC<AdminDrawerProps> = ({ 
  isOpen, 
  onClose,
  initialTab = 'users' 
}) => {
  const [activeTab, setActiveTab] = useState<'users' | 'teams' | 'audit'>(initialTab);
  const { teams, fetchTeams } = useTeamStore();

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  useEffect(() => {
    if (isOpen) {
      fetchTeams();
    }
  }, [isOpen, fetchTeams]);

  // ESC to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity" 
        onClick={onClose}
      />

      {/* Drawer Panel */}
      <div className="relative w-full max-w-3xl bg-panel border-l border-border h-full flex flex-col shadow-2xl z-10 animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between bg-elevated/40">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-accent-subtle border border-accent/20 flex items-center justify-center text-accent">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-content-primary">Admin Console</h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-floor text-content-muted border border-border">
                  Main-Admin Only
                </span>
              </div>
              <p className="text-xs text-content-secondary">
                Department rosters, lead permissions, storage quotas, and security audit log.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg text-content-muted hover:text-content-primary hover:bg-floor transition-colors"
            title="Close Drawer (ESC)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-4 sm:px-6 pt-3 border-b border-border bg-panel flex items-center gap-2">
          <button
            onClick={() => setActiveTab('users')}
            className={`pb-3 px-3 text-xs font-semibold flex items-center gap-2 border-b-2 active:scale-[0.98] transition-all duration-150 ${
              activeTab === 'users'
                ? 'border-accent text-accent'
                : 'border-transparent text-content-muted hover:text-content-primary'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Users & Roles</span>
          </button>

          <button
            onClick={() => setActiveTab('teams')}
            className={`pb-3 px-3 text-xs font-semibold flex items-center gap-2 border-b-2 active:scale-[0.98] transition-all duration-150 ${
              activeTab === 'teams'
                ? 'border-accent text-accent'
                : 'border-transparent text-content-muted hover:text-content-primary'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Departments ({teams.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('audit')}
            className={`pb-3 px-3 text-xs font-semibold flex items-center gap-2 border-b-2 active:scale-[0.98] transition-all duration-150 ${
              activeTab === 'audit'
                ? 'border-accent text-accent'
                : 'border-transparent text-content-muted hover:text-content-primary'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Audit Trail</span>
          </button>
        </div>

        {/* Tab Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-floor/40">
          {activeTab === 'users' && (
            <UserManagementTab teams={teams} onTeamUpdated={fetchTeams} />
          )}

          {activeTab === 'teams' && (
            <TeamManagementTab teams={teams} onTeamCreatedOrUpdated={fetchTeams} />
          )}

          {activeTab === 'audit' && (
            <AuditLogTab />
          )}
        </div>
      </div>
    </div>
  );
};
