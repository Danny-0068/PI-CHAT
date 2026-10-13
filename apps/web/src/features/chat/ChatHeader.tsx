import React from 'react';
import { useChatStore } from '../../store/chatStore';

export const ChatHeader: React.FC = () => {
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const conversations = useChatStore((s) => s.conversations);
  const onlineUserIds = useChatStore((s) => s.onlineUserIds);

  const activeConv = conversations.find((c) => c.id === activeConversationId);

  if (!activeConv) {
    return (
      <div className="h-14 px-6 border-b border-border flex items-center bg-panel shrink-0">
        <span className="text-xs text-content-muted">Select a conversation to start chatting</span>
      </div>
    );
  }

  const isDM = activeConv.type === 'DM';
  const isOnline = isDM && activeConv.other_user ? onlineUserIds.includes(activeConv.other_user.id) : false;

  return (
    <div className="h-14 px-5 border-b border-border flex items-center justify-between bg-panel shrink-0">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2.5">
          {activeConv.type === 'UPDATES' ? (
            <span className="w-8 h-8 rounded-lg bg-status-away/10 text-status-away font-bold text-base flex items-center justify-center border border-status-away/20">
              📢
            </span>
          ) : isDM ? (
            <div className="relative">
              <div className="w-8 h-8 rounded-full bg-elevated text-content-primary text-xs font-bold flex items-center justify-center uppercase border border-border">
                {activeConv.title.slice(0, 2)}
              </div>
              <span
                className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-panel ${
                  isOnline ? 'bg-status-available' : 'bg-content-muted/40'
                }`}
              />
            </div>
          ) : (
            <span
              className="w-8 h-8 rounded-lg bg-accent-subtle text-accent font-bold text-base flex items-center justify-center border border-accent/20"
              style={{ color: activeConv.color || undefined }}
            >
              #
            </span>
          )}

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-content-primary tracking-tight">
                {activeConv.title}
              </h2>
              {activeConv.type === 'UPDATES' && (
                <span className="text-[10px] bg-status-away/10 text-status-away font-medium px-1.5 py-0.5 rounded border border-status-away/20">
                  Broadcast
                </span>
              )}
              {isDM && activeConv.other_user?.role === 'MAIN_ADMIN' && (
                <span className="text-[10px] bg-accent-subtle text-accent font-medium px-1.5 py-0.5 rounded border border-accent/20">
                  Admin
                </span>
              )}
            </div>
            <p className="text-[11px] text-content-muted flex items-center gap-1.5">
              {activeConv.type === 'UPDATES' ? (
                'Company-wide announcements & updates'
              ) : isDM ? (
                <span>{isOnline ? 'Active now' : 'Offline'}</span>
              ) : (
                'Team discussion & collaboration'
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-content-muted">
        <span className="px-2 py-0.5 rounded bg-elevated font-mono text-[10px] border border-border">
          Relay Core v0.1
        </span>
      </div>
    </div>
  );
};

