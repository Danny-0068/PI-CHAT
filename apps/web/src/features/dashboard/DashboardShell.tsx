import React, { useState, useEffect } from 'react';
import { 
  LogOut, 
  ShieldCheck, 
  UserCheck, 
  ShieldAlert, 
  MessageSquare, 
  Users, 
  Bell, 
  FolderKanban, 
  Settings, 
  Key, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Shield,
  Sparkles
} from 'lucide-react';
import { useAuthStore, UserStatus } from '../../store/authStore';
import { useChatStore } from '../../store/chatStore';
import { apiFetch } from '../../lib/api';
import { SudoModal } from '../auth/SudoModal';
import { TeamsAccordion } from '../../components/TeamsAccordion';
import { AdminDrawer } from '../admin/AdminDrawer';
import { SidebarConversationsList } from '../chat/SidebarConversationsList';
import { ChatArea } from '../chat/ChatArea';
import { StatusPopover } from '../../components/StatusPopover';

export const DashboardShell: React.FC = () => {
  const { user, clearAuth } = useAuthStore();
  const fetchConversations = useChatStore((s) => s.fetchConversations);
  const startDM = useChatStore((s) => s.startDM);
  const updateMyStatus = useChatStore((s) => s.updateMyStatus);
  const conversations = useChatStore((s) => s.conversations);

  const [activeRailTab, setActiveRailTab] = useState<'messages' | 'teams' | 'security'>('messages');
  const [loggingOut, setLoggingOut] = useState(false);
  const [isSudoModalOpen, setIsSudoModalOpen] = useState(false);
  const [sudoToken, setSudoToken] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [isAdminDrawerOpen, setIsAdminDrawerOpen] = useState(false);
  const [adminDrawerTab, setAdminDrawerTab] = useState<'users' | 'teams' | 'audit'>('users');
  const [isStatusPopoverOpen, setIsStatusPopoverOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  if (!user) return null;

  const totalUnread = conversations.reduce((acc, c) => acc + (c.unread_count || 0), 0);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch {
      // Clear anyway on client
    } finally {
      clearAuth();
      setLoggingOut(false);
    }
  };

  const handleStatusChange = async (newStatus: UserStatus) => {
    setStatusLoading(true);
    try {
      await updateMyStatus(newStatus, user.status_text);
    } catch (err) {
      console.error('Failed to update status', err);
    } finally {
      setStatusLoading(false);
    }
  };

  const handleSudoSuccess = (token: string) => {
    setSudoToken(token);
    setActionMessage({
      type: 'success',
      text: 'Sudo-mode step-up verified! Elevated 5-minute session active.',
    });
  };

  const testCreateAdminWithoutSudo = async () => {
    setActionMessage(null);
    try {
      await apiFetch('/users', {
        method: 'POST',
        body: JSON.stringify({
          email: `admin_${Date.now()}@acme.demo`,
          display_name: 'Test Second Admin',
          role: 'MAIN_ADMIN',
          password: 'Password123!',
        }),
      });
      setActionMessage({ type: 'success', text: 'Created admin unexpectedly without sudo!' });
    } catch (err) {
      setActionMessage({
        type: 'error',
        text: `Enforced by Server: ${err instanceof Error ? err.message : 'Blocked without sudo'}`,
      });
    }
  };

  const testCreateAdminWithSudo = async () => {
    if (!sudoToken) {
      setIsSudoModalOpen(true);
      return;
    }
    setActionMessage(null);
    try {
      const newAdmin = await apiFetch('/users', {
        method: 'POST',
        sudoToken,
        body: JSON.stringify({
          email: `admin_${Date.now()}@acme.demo`,
          display_name: 'Elevated Admin',
          role: 'MAIN_ADMIN',
          password: 'Password123!',
        }),
      });
      setActionMessage({
        type: 'success',
        text: `Success with Sudo Token: Created new Main-Admin (${newAdmin.email})`,
      });
    } catch (err) {
      setActionMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed creating admin',
      });
    }
  };

  const getStatusColor = (status: UserStatus) => {
    switch (status) {
      case 'AVAILABLE': return 'bg-status-available';
      case 'AWAY': return 'bg-status-away';
      case 'DND': return 'bg-status-dnd';
    }
  };

  return (
    <div className="flex-1 flex max-w-7xl w-full mx-auto p-3 md:p-4 gap-4">
      <SudoModal
        isOpen={isSudoModalOpen}
        onClose={() => setIsSudoModalOpen(false)}
        onSuccess={handleSudoSuccess}
        actionTitle="Create Additional Main-Admin"
      />

      {/* Left Mini-Rail (§3.2 Panel 1) */}
      <aside className="hidden md:flex flex-col items-center py-3 px-2 w-16 bg-panel border border-border rounded-xl shadow-xs gap-3 self-stretch">
        <button 
          onClick={() => setActiveRailTab('messages')}
          className={`w-10 h-10 rounded-lg flex items-center justify-center relative transition-colors ${
            activeRailTab === 'messages'
              ? 'text-accent bg-accent-subtle border border-accent/20'
              : 'text-content-secondary hover:text-content-primary hover:bg-floor'
          }`}
          title="Messages & Chat"
          aria-label="Messages"
        >
          <MessageSquare className="w-5 h-5" />
          {totalUnread > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-accent text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-xs">
              {totalUnread}
            </span>
          )}
        </button>

        <button 
          onClick={() => setActiveRailTab('teams')}
          className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
            activeRailTab === 'teams'
              ? 'text-accent bg-accent-subtle border border-accent/20'
              : 'text-content-secondary hover:text-content-primary hover:bg-floor'
          }`}
          title="Teams & Departments"
          aria-label="Teams"
        >
          <Users className="w-5 h-5" />
        </button>

        {user.role === 'MAIN_ADMIN' && (
          <button 
            onClick={() => {
              setAdminDrawerTab('users');
              setIsAdminDrawerOpen(true);
            }}
            className="w-10 h-10 rounded-lg flex items-center justify-center text-accent hover:bg-accent-subtle transition-colors"
            title="Admin Console (Main-Admin)"
            aria-label="Admin Console"
          >
            <ShieldCheck className="w-5 h-5" />
          </button>
        )}

        <button 
          onClick={() => setActiveRailTab('security')}
          className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
            activeRailTab === 'security'
              ? 'text-accent bg-accent-subtle border border-accent/20'
              : 'text-content-secondary hover:text-content-primary hover:bg-floor'
          }`}
          title="Security Lab & Sudo Mode"
          aria-label="Security Lab"
        >
          <Key className="w-5 h-5" />
        </button>

        <button 
          className="w-10 h-10 rounded-lg flex items-center justify-center text-content-secondary hover:text-content-primary hover:bg-floor transition-colors"
          title="Updates Channel"
          aria-label="Updates"
        >
          <Bell className="w-5 h-5" />
        </button>

        <button 
          className="w-10 h-10 rounded-lg flex items-center justify-center text-content-secondary hover:text-content-primary hover:bg-floor transition-colors"
          title="Files"
          aria-label="Files"
        >
          <FolderKanban className="w-5 h-5" />
        </button>

        <div className="w-8 border-b border-border my-1" />

        <button 
          className="w-10 h-10 rounded-lg flex items-center justify-center text-content-secondary hover:text-content-primary hover:bg-floor transition-colors"
          title="Settings"
          aria-label="Settings"
        >
          <Settings className="w-5 h-5" />
        </button>

        {/* User Avatar with Presence Dot */}
        <div
          onClick={() => setIsStatusPopoverOpen(true)}
          className="mt-auto relative pt-2 cursor-pointer group"
          title="Click to set presence & status"
        >
          <div className="w-9 h-9 rounded-full bg-elevated border border-border group-hover:border-accent flex items-center justify-center font-medium text-xs text-content-primary shadow-xs transition-colors">
            {user.display_name.split(' ').map(n => n[0]).join('')}
          </div>
          <span 
            className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-panel ${getStatusColor(user.status)}`}
          />
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col gap-3 min-w-0">
        {/* User Session Bar */}
        <div className="bg-panel border border-border rounded-xl p-3 md:px-4 md:py-3 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div
              onClick={() => setIsStatusPopoverOpen(true)}
              className="relative cursor-pointer group"
              title="Click to set presence & status"
            >
              <div className="w-9 h-9 rounded-full bg-elevated border border-border group-hover:border-accent flex items-center justify-center font-semibold text-xs text-content-primary shadow-xs transition-colors">
                {user.display_name.split(' ').map(n => n[0]).join('')}
              </div>
              <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-panel ${getStatusColor(user.status)}`} />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-content-primary">{user.display_name}</span>
                <span className={`text-[10px] font-mono font-medium px-2 py-0.5 rounded-full flex items-center gap-1 ${
                  user.role === 'MAIN_ADMIN' 
                    ? 'bg-accent-subtle text-accent border border-accent/20' 
                    : 'bg-elevated text-content-secondary border border-border'
                }`}>
                  {user.role === 'MAIN_ADMIN' ? <ShieldCheck className="w-3 h-3" /> : <UserCheck className="w-3 h-3" />}
                  {user.role}
                </span>
                {user.is_demo && (
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-floor text-content-muted border border-border">
                    demo account
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <p className="text-[11px] text-content-secondary font-mono">{user.email}</p>
                {user.status_text && (
                  <>
                    <span className="text-content-muted text-[10px]">•</span>
                    <span
                      onClick={() => setIsStatusPopoverOpen(true)}
                      className="text-[11px] text-accent font-medium italic truncate max-w-[220px] cursor-pointer hover:underline"
                      title={user.status_text}
                    >
                      "{user.status_text}"
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* View Switcher Tabs (For mobile & direct navigation) */}
            <div className="flex items-center gap-1 bg-elevated border border-border rounded-lg p-1 text-xs">
              <button
                onClick={() => setActiveRailTab('messages')}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                  activeRailTab === 'messages'
                    ? 'bg-panel text-accent font-semibold shadow-xs border border-border'
                    : 'text-content-muted hover:text-content-secondary'
                }`}
              >
                Chat
              </button>
              <button
                onClick={() => setActiveRailTab('teams')}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                  activeRailTab === 'teams'
                    ? 'bg-panel text-accent font-semibold shadow-xs border border-border'
                    : 'text-content-muted hover:text-content-secondary'
                }`}
              >
                Teams
              </button>
              <button
                onClick={() => setActiveRailTab('security')}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                  activeRailTab === 'security'
                    ? 'bg-panel text-accent font-semibold shadow-xs border border-border'
                    : 'text-content-muted hover:text-content-secondary'
                }`}
              >
                Security Lab
              </button>
            </div>

            {/* Status Dropdown + Popover */}
            <div className="relative flex items-center gap-1 text-xs bg-elevated border border-border rounded-lg p-1">
              {(['AVAILABLE', 'AWAY', 'DND'] as UserStatus[]).map((st) => (
                <button
                  key={st}
                  disabled={statusLoading}
                  onClick={() => handleStatusChange(st)}
                  className={`px-2 py-1 rounded text-[11px] font-medium flex items-center gap-1.5 transition-colors ${
                    user.status === st
                      ? 'bg-panel text-content-primary border border-border shadow-xs'
                      : 'text-content-muted hover:text-content-secondary'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${getStatusColor(st)}`} />
                  <span>{st === 'AVAILABLE' ? 'Online' : st === 'AWAY' ? 'Away' : 'DND'}</span>
                </button>
              ))}

              <button
                onClick={() => setIsStatusPopoverOpen(true)}
                className="px-2 py-1 rounded text-[11px] font-medium text-accent hover:bg-accent-subtle flex items-center gap-1 transition-colors border border-transparent hover:border-accent/20"
                title="Edit custom status message"
              >
                <Sparkles className="w-3 h-3" />
                <span className="hidden sm:inline">Status</span>
              </button>

              <StatusPopover
                isOpen={isStatusPopoverOpen}
                onClose={() => setIsStatusPopoverOpen(false)}
              />
            </div>

            {user.role === 'MAIN_ADMIN' && (
              <button
                onClick={() => {
                  setAdminDrawerTab('users');
                  setIsAdminDrawerOpen(true);
                }}
                className="px-3 py-1.5 rounded-lg bg-accent text-white hover:bg-accent-hover text-xs font-medium flex items-center gap-1.5 transition-colors shadow-xs"
              >
                <Shield className="w-3.5 h-3.5" />
                <span>Admin Console</span>
              </button>
            )}

            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-status-dnd hover:bg-floor flex items-center gap-1.5 transition-colors"
            >
              {loggingOut ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
              <span>Sign Out</span>
            </button>
          </div>
        </div>

        {/* View 1: Realtime Dual-Panel Chat Workspace (§3.1, §3.2) */}
        {activeRailTab === 'messages' && (
          <div className="flex-1 flex overflow-hidden border border-border rounded-xl bg-panel shadow-xs min-h-[600px] h-[calc(100vh-10.5rem)] relative">
            <SidebarConversationsList
              isMobileOpen={isMobileSidebarOpen}
              onCloseMobile={() => setIsMobileSidebarOpen(false)}
            />
            <ChatArea onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)} />
          </div>
        )}

        {/* View 2: Teams & Departments Accordion (§3) */}
        {activeRailTab === 'teams' && (
          <div className="space-y-4">
            <TeamsAccordion 
              onOpenAdminTeamTab={() => {
                setAdminDrawerTab('teams');
                setIsAdminDrawerOpen(true);
              }}
              onStartDM={async (targetUserId) => {
                await startDM(targetUserId);
                setActiveRailTab('messages');
              }}
            />
          </div>
        )}

        {/* View 3: Security & Sudo Lab Verification Grid (§2, §4) */}
        {activeRailTab === 'security' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Sudo-Mode Step-Up Card */}
              <div className="bg-panel border border-border rounded-xl p-5 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-content-primary font-semibold text-sm">
                      <Key className="w-4 h-4 text-accent" />
                      <span>Sudo-Mode Step-Up (§2)</span>
                    </div>
                    {sudoToken ? (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-status-available/10 text-status-available border border-status-available/20">
                        Sudo Active (5m)
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-floor text-content-muted border border-border">
                        Standard Mode
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-content-secondary mb-4">
                    Creating another Main-Admin or resetting an admin password requires step-up authentication.
                  </p>
                </div>

                <div className="space-y-2 pt-2 border-t border-border">
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={testCreateAdminWithoutSudo}
                      className="px-3 py-1.5 rounded-lg bg-elevated hover:bg-floor border border-border text-xs font-medium text-content-secondary transition-colors"
                    >
                      Test Create Admin (No Sudo)
                    </button>
                    <button
                      onClick={testCreateAdminWithSudo}
                      className="px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-medium flex items-center gap-1.5 transition-colors shadow-xs"
                    >
                      <ShieldAlert className="w-3.5 h-3.5" />
                      <span>{sudoToken ? 'Create Admin (With Sudo)' : 'Trigger Sudo Step-Up'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Session & Security Baseline Card */}
              <div className="bg-panel border border-border rounded-xl p-5 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 text-content-primary font-semibold text-sm mb-2">
                    <RefreshCw className="w-4 h-4 text-accent" />
                    <span>Rotating Refresh Tokens (§4)</span>
                  </div>
                  <p className="text-xs text-content-secondary mb-3">
                    Access tokens are held in-memory (15m). Rotating refresh tokens are stored in httpOnly cookies with reuse detection revoking the token family.
                  </p>
                </div>

                <div className="space-y-1.5 text-[11px] font-mono bg-elevated p-3 rounded-lg border border-border">
                  <div className="flex justify-between text-content-secondary">
                    <span>Access Token Storage:</span>
                    <span className="text-status-available">In-Memory (0 in localStorage)</span>
                  </div>
                  <div className="flex justify-between text-content-secondary">
                    <span>Refresh Token Cookie:</span>
                    <span className="text-status-available">httpOnly; Secure; SameSite</span>
                  </div>
                  <div className="flex justify-between text-content-secondary">
                    <span>Password Hash:</span>
                    <span className="text-accent font-medium">Argon2id (argon2-cffi)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Status Output */}
            {actionMessage && (
              <div className={`p-4 rounded-xl border text-xs flex items-center gap-2.5 ${
                actionMessage.type === 'success'
                  ? 'bg-status-available/10 border-status-available/20 text-status-available'
                  : 'bg-status-dnd/10 border-status-dnd/20 text-status-dnd'
              }`}>
                {actionMessage.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                )}
                <span className="font-mono">{actionMessage.text}</span>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Phase 3: Admin Console Drawer */}
      <AdminDrawer
        isOpen={isAdminDrawerOpen}
        onClose={() => setIsAdminDrawerOpen(false)}
        initialTab={adminDrawerTab}
      />
    </div>
  );
};

