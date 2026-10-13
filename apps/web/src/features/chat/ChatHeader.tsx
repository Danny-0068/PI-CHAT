import React from 'react';
import { useChatStore } from '../../store/chatStore';
import { Menu } from 'lucide-react';

interface ChatHeaderProps {
  onOpenMobileSidebar?: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({ onOpenMobileSidebar }) => {
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const conversations = useChatStore((s) => s.conversations);
  const onlineUserIds = useChatStore((s) => s.onlineUserIds);

  const activeConv = conversations.find((c) => c.id === activeConversationId);

  if (!activeConv) {
    return (
      <div className="h-14 px-4 md:px-6 border-b border-border flex items-center bg-panel shrink-0 gap-3">
        {onOpenMobileSidebar && (
          <button
            onClick={onOpenMobileSidebar}
            className="md:hidden p-1.5 rounded-lg text-content-muted hover:text-content-primary hover:bg-floor transition-colors"
            title="Open Conversations Menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <span className="text-xs text-content-muted">Select a conversation to start chatting</span>
      </div>
    );
  }

  const isDM = activeConv.type === 'DM';
  const otherUser = activeConv.other_user;
  const isOnline = isDM && otherUser ? onlineUserIds.includes(otherUser.id) : false;
  const status = otherUser?.status || 'AVAILABLE';

  const getStatusColor = () => {
    if (status === 'DND') return 'bg-status-dnd';
    if (status === 'AWAY') return 'bg-status-away';
    if (isOnline) return 'bg-status-available';
    return 'bg-content-muted/40';
  };

  const getStatusLabel = () => {
    if (status === 'DND') return 'Do Not Disturb';
    if (status === 'AWAY') return 'Away';
    if (isOnline) return 'Active now';
    return 'Offline';
  };

  return (
    <div className="h-14 px-3 md:px-5 border-b border-border flex items-center justify-between bg-panel shrink-0">
      <div className="flex items-center gap-2 md:gap-3 min-w-0">
        {/* Mobile Hamburger Menu Toggle */}
        {onOpenMobileSidebar && (
          <button
            onClick={onOpenMobileSidebar}
            className="md:hidden p-1.5 rounded-lg text-content-muted hover:text-content-primary hover:bg-floor transition-colors shrink-0"
            title="Open conversations drawer"
            aria-label="Open navigation"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}

        <div className="flex items-center gap-2.5 min-w-0">
          {activeConv.type === 'UPDATES' ? (
            <span className="w-8 h-8 rounded-lg bg-status-away/10 text-status-away font-bold text-base flex items-center justify-center border border-status-away/20 shrink-0">
              📢
            </span>
          ) : isDM ? (
            <div className="relative shrink-0">
              <div className="w-8 h-8 rounded-full bg-elevated text-content-primary text-xs font-bold flex items-center justify-center uppercase border border-border">
                {activeConv.title.slice(0, 2)}
              </div>
              <span
                className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-panel ${getStatusColor()}`}
              />
            </div>
          ) : (
            <span
              className="w-8 h-8 rounded-lg bg-accent-subtle text-accent font-bold text-base flex items-center justify-center border border-accent/20 shrink-0"
              style={{ color: activeConv.color || undefined }}
            >
              #
            </span>
          )}

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-content-primary tracking-tight truncate">
                {activeConv.title}
              </h2>
              {activeConv.type === 'UPDATES' && (
                <span className="text-[10px] bg-status-away/10 text-status-away font-medium px-1.5 py-0.5 rounded border border-status-away/20 shrink-0">
                  Broadcast
                </span>
              )}
              {isDM && activeConv.other_user?.role === 'MAIN_ADMIN' && (
                <span className="text-[10px] bg-accent-subtle text-accent font-medium px-1.5 py-0.5 rounded border border-accent/20 shrink-0">
                  Admin
                </span>
              )}
            </div>
            <div className="text-[11px] text-content-muted flex items-center gap-2 truncate">
              {activeConv.type === 'UPDATES' ? (
                <span>Company-wide announcements & updates</span>
              ) : isDM ? (
                <div className="flex items-center gap-1.5 truncate">
                  <span className="flex items-center gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${getStatusColor()}`} />
                    <span>{getStatusLabel()}</span>
                  </span>
                  {otherUser?.status_text && (
                    <>
                      <span>•</span>
                      <span className="italic truncate text-content-secondary max-w-[200px]" title={otherUser.status_text}>
                        "{otherUser.status_text}"
                      </span>
                    </>
                  )}
                </div>
              ) : (
                <span>Team discussion & collaboration</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-content-muted shrink-0">
        <span className="hidden sm:inline px-2 py-0.5 rounded bg-elevated font-mono text-[10px] border border-border">
          Relay Core v0.1
        </span>
      </div>
    </div>
  );
};
