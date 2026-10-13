import React, { useState, useEffect } from 'react';
import { useChatStore } from '../../store/chatStore';
import { useAuthStore } from '../../store/authStore';
import { apiFetch } from '../../lib/api';
import { NewDMModal } from './NewDMModal';
import { 
  ChevronDown, 
  ChevronRight, 
  Plus, 
  Search, 
  Users, 
  X, 
  CheckCheck,
  Check
} from 'lucide-react';

interface DirectoryTeam {
  id: string;
  name: string;
  display_name: string;
  department_name: string;
  color?: string | null;
  active_members_count: number;
}

interface DirectoryUser {
  id: string;
  email: string;
  display_name: string;
  role: string;
  status: string;
  status_text: string | null;
}

interface SidebarConversationsListProps {
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const SidebarConversationsList: React.FC<SidebarConversationsListProps> = ({
  isMobileOpen = false,
  onCloseMobile,
}) => {
  const conversations = useChatStore((s) => s.conversations);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const onlineUserIds = useChatStore((s) => s.onlineUserIds);
  const startDM = useChatStore((s) => s.startDM);
  const currentUser = useAuthStore((s) => s.user);

  const [filterText, setFilterText] = useState('');
  const [showNewDMModal, setShowNewDMModal] = useState(false);
  const [isTeamsExpanded, setIsTeamsExpanded] = useState(false);
  const [teams, setTeams] = useState<DirectoryTeam[]>([]);
  const [directoryUsers, setDirectoryUsers] = useState<DirectoryUser[]>([]);

  // Load directory teams & users
  useEffect(() => {
    apiFetch<DirectoryTeam[]>('/teams')
      .then((data) => setTeams(data))
      .catch((err) => console.error('Failed to load teams for directory:', err));

    apiFetch<DirectoryUser[]>('/users')
      .then((data) => setDirectoryUsers(data.filter((u) => u.id !== currentUser?.id)))
      .catch((err) => console.error('Failed to load directory users:', err));
  }, [currentUser?.id]);

  const query = filterText.toLowerCase().trim();

  // Filter conversations
  const filteredConvs = conversations.filter((c) =>
    c.title.toLowerCase().includes(query) ||
    (c.other_user?.display_name && c.other_user.display_name.toLowerCase().includes(query)) ||
    (c.last_message?.content && c.last_message.content.toLowerCase().includes(query))
  );

  const channels = filteredConvs.filter((c) => c.type !== 'DM');
  const dms = filteredConvs.filter((c) => c.type === 'DM');

  // Filter directory users if searching
  const matchingColleagues = query
    ? directoryUsers.filter(
        (u) =>
          u.display_name.toLowerCase().includes(query) ||
          u.email.toLowerCase().includes(query) ||
          (u.status_text && u.status_text.toLowerCase().includes(query))
      )
    : [];

  const formatTime = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const getStatusColorClass = (status: string, isOnline: boolean) => {
    if (status === 'DND') return 'bg-status-dnd';
    if (status === 'AWAY') return 'bg-status-away';
    if (isOnline) return 'bg-status-available';
    return 'bg-content-muted/40';
  };

  const handleSelectConversation = (id: string) => {
    setActiveConversation(id);
    if (onCloseMobile) onCloseMobile();
  };

  const handleStartDMFromColleague = async (targetUserId: string) => {
    await startDM(targetUserId);
    if (onCloseMobile) onCloseMobile();
  };

  const content = (
    <div className="flex flex-col h-full bg-panel border-r border-border select-none w-72 md:w-80 shrink-0">
      {/* Search Header */}
      <div className="p-3 border-b border-border space-y-2">
        <div className="flex items-center justify-between md:hidden">
          <span className="text-xs font-bold text-content-primary">Channels & DMs</span>
          <button
            onClick={onCloseMobile}
            className="p-1 text-content-muted hover:text-content-primary rounded-md"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-content-muted" />
          <input
            type="text"
            placeholder="Search channels, teams, colleagues..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="w-full pl-8 pr-7 py-1.5 text-xs bg-elevated border border-border rounded-lg text-content-primary placeholder:text-content-muted focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent transition-all"
          />
          {filterText && (
            <button
              onClick={() => setFilterText('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-content-muted hover:text-content-primary"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Conversations Scroll Area */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {/* CHANNELS SECTION */}
        <div>
          <div className="px-2 pb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-content-muted">
              Channels
            </span>
            <span className="text-[10px] text-content-muted font-mono">
              {channels.length}
            </span>
          </div>
          <div className="space-y-0.5">
            {channels.map((conv) => {
              const isActive = activeConversationId === conv.id;
              const isUpdates = conv.type === 'UPDATES';

              return (
                <button
                  key={conv.id}
                  onClick={() => handleSelectConversation(conv.id)}
                  className={`w-full group flex items-center justify-between px-2.5 py-2 rounded-lg text-left transition-all active:scale-[0.98] ${
                    isActive
                      ? 'bg-accent-subtle text-accent font-semibold shadow-xs border border-accent/20'
                      : 'text-content-secondary hover:bg-floor hover:text-content-primary'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`text-sm font-semibold flex items-center justify-center shrink-0 ${
                        isUpdates
                          ? 'text-status-away'
                          : conv.color
                          ? ''
                          : 'text-content-muted'
                      }`}
                      style={{ color: conv.color || undefined }}
                    >
                      {isUpdates ? '📢' : '#'}
                    </span>
                    <div className="truncate">
                      <span className="text-xs truncate block font-medium">
                        {conv.title.replace(/^#/, '')}
                      </span>
                      {conv.last_message && (
                        <span className="text-[10px] text-content-muted block truncate max-w-[150px]">
                          {conv.last_message.is_deleted
                            ? 'Message deleted'
                            : `${conv.last_message.sender.display_name.split(' ')[0]}: ${conv.last_message.content}`}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {conv.unread_count > 0 && (
                      <span className="px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-accent text-white font-mono shadow-xs">
                        {conv.unread_count}
                      </span>
                    )}
                    {conv.last_message && (
                      <span className="text-[10px] text-content-muted font-mono">
                        {formatTime(conv.last_message.created_at)}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* EMBEDDED TEAMS & DEPARTMENTS DIRECTORY ACCORDION */}
        <div className="border-t border-b border-border/50 py-2">
          <button
            onClick={() => setIsTeamsExpanded(!isTeamsExpanded)}
            className="w-full flex items-center justify-between px-2 py-1 text-left rounded-md hover:bg-floor transition-colors group"
          >
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-content-muted group-hover:text-content-primary">
              <Users className="w-3.5 h-3.5 text-accent" />
              <span>Teams & Colleagues</span>
              <span className="text-[10px] font-mono text-content-muted">
                ({teams.length})
              </span>
            </div>
            {isTeamsExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-content-muted" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-content-muted" />
            )}
          </button>

          {isTeamsExpanded && (
            <div className="mt-2 pl-2 space-y-1 animate-fade-in">
              <p className="text-[10px] text-content-muted px-2 mb-1">
                Click any team or colleague to collaborate:
              </p>
              {teams.map((t) => (
                <div
                  key={t.id}
                  className="px-2 py-1.5 rounded-lg bg-elevated/40 border border-border/50 flex items-center justify-between text-xs"
                >
                  <div className="truncate">
                    <span className="font-medium text-content-primary block truncate">
                      {t.display_name}
                    </span>
                    <span className="text-[10px] text-content-muted block truncate">
                      {t.department_name} • {t.active_members_count} members
                    </span>
                  </div>
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: t.color || '#00D26A' }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* LIVE SEARCH RESULTS: COLLEAGUES DIRECTORY (WHEN SEARCHING) */}
        {query && matchingColleagues.length > 0 && (
          <div>
            <div className="px-2 pb-1.5 flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-accent">
                Matching Colleagues ({matchingColleagues.length})
              </span>
            </div>
            <div className="space-y-0.5">
              {matchingColleagues.map((u) => {
                const isOnline = onlineUserIds.includes(u.id);
                return (
                  <button
                    key={u.id}
                    onClick={() => handleStartDMFromColleague(u.id)}
                    className="w-full group flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left hover:bg-floor transition-all"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="relative shrink-0">
                        <div className="w-6 h-6 rounded-full bg-elevated text-content-primary text-[10px] font-bold flex items-center justify-center uppercase border border-border">
                          {u.display_name.slice(0, 2)}
                        </div>
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-panel ${getStatusColorClass(
                            u.status,
                            isOnline
                          )}`}
                        />
                      </div>
                      <div className="truncate">
                        <span className="text-xs truncate block font-medium text-content-primary">
                          {u.display_name}
                        </span>
                        {u.status_text && (
                          <span className="text-[10px] text-accent block truncate max-w-[140px]">
                            {u.status_text}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] text-accent font-medium hover:underline">
                      Message
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* DIRECT MESSAGES SECTION */}
        <div>
          <div className="px-2 pb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-content-muted">
              Direct Messages
            </span>
            <button
              onClick={() => setShowNewDMModal(true)}
              className="text-[11px] text-accent hover:text-accent-hover font-medium flex items-center gap-1 hover:underline active:scale-[0.97] transition-all"
              title="Start a new direct message"
            >
              <Plus className="w-3 h-3" />
              <span>New</span>
            </button>
          </div>
          <div className="space-y-0.5">
            {dms.length === 0 ? (
              <div className="px-2 py-3 text-center text-[11px] text-content-muted">
                No active DMs yet. Click <span className="text-accent font-medium">New</span> to start one.
              </div>
            ) : (
              dms.map((conv) => {
                const isActive = activeConversationId === conv.id;
                const otherUser = conv.other_user;
                const isOnline = otherUser ? onlineUserIds.includes(otherUser.id) : false;
                const status = otherUser?.status || 'AVAILABLE';

                // Read receipt for sender's last message
                const isMyLastMessage = conv.last_message && currentUser && conv.last_message.sender.id === currentUser.id;
                const isSeenByRecipient =
                  isMyLastMessage &&
                  conv.other_user_last_read_at &&
                  conv.last_message &&
                  new Date(conv.other_user_last_read_at).getTime() >=
                    new Date(conv.last_message.created_at).getTime();

                return (
                  <button
                    key={conv.id}
                    onClick={() => handleSelectConversation(conv.id)}
                    className={`w-full group flex items-center justify-between px-2.5 py-2 rounded-lg text-left transition-all active:scale-[0.98] ${
                      isActive
                        ? 'bg-accent-subtle text-accent font-semibold shadow-xs border border-accent/20'
                        : 'text-content-secondary hover:bg-floor hover:text-content-primary'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="relative shrink-0">
                        <div className="w-7 h-7 rounded-full bg-elevated text-content-primary text-[10px] font-bold flex items-center justify-center uppercase border border-border">
                          {conv.title.slice(0, 2)}
                        </div>
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-panel ${getStatusColorClass(
                            status,
                            isOnline
                          )}`}
                          title={
                            status === 'DND'
                              ? 'Do Not Disturb'
                              : status === 'AWAY'
                              ? 'Away'
                              : isOnline
                              ? 'Online'
                              : 'Offline'
                          }
                        />
                      </div>
                      <div className="truncate">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs truncate font-medium block">
                            {conv.title}
                          </span>
                          {otherUser?.status_text && (
                            <span className="text-[10px] text-content-muted truncate max-w-[90px] font-normal italic">
                              "{otherUser.status_text}"
                            </span>
                          )}
                        </div>
                        {conv.last_message && (
                          <div className="flex items-center gap-1 text-[10px] text-content-muted truncate max-w-[140px]">
                            {isMyLastMessage && (
                              <span>
                                {isSeenByRecipient ? (
                                  <CheckCheck className="w-3 h-3 text-accent inline shrink-0" />
                                ) : (
                                  <Check className="w-3 h-3 text-content-muted inline shrink-0" />
                                )}
                              </span>
                            )}
                            <span className="truncate">
                              {conv.last_message.is_deleted
                                ? 'Message deleted'
                                : conv.last_message.content}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {conv.unread_count > 0 && (
                        <span className="px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-accent text-white font-mono shadow-xs">
                          {conv.unread_count}
                        </span>
                      )}
                      {conv.last_message && (
                        <span className="text-[10px] text-content-muted font-mono">
                          {formatTime(conv.last_message.created_at)}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      <NewDMModal
        isOpen={showNewDMModal}
        onClose={() => setShowNewDMModal(false)}
      />
    </div>
  );

  // If mobile drawer is triggered, render slide-over overlay
  if (isMobileOpen) {
    return (
      <div className="fixed inset-0 z-50 flex md:hidden animate-fade-in">
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
          onClick={onCloseMobile}
        />
        <div className="relative z-10 w-72 max-w-[80vw] h-full shadow-2xl animate-slide-in">
          {content}
        </div>
      </div>
    );
  }

  // Normal desktop column
  return <div className="hidden md:flex h-full shrink-0">{content}</div>;
};
