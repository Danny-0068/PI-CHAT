import React, { useState } from 'react';
import { useChatStore } from '../../store/chatStore';
import { NewDMModal } from './NewDMModal';

export const SidebarConversationsList: React.FC = () => {
  const conversations = useChatStore((s) => s.conversations);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const onlineUserIds = useChatStore((s) => s.onlineUserIds);

  const [filterText, setFilterText] = useState('');
  const [showNewDMModal, setShowNewDMModal] = useState(false);

  const filtered = conversations.filter((c) =>
    c.title.toLowerCase().includes(filterText.toLowerCase())
  );

  const channels = filtered.filter((c) => c.type !== 'DM');
  const dms = filtered.filter((c) => c.type === 'DM');

  const formatTime = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div className="flex flex-col h-full bg-panel border-r border-border select-none w-64 md:w-72 shrink-0">
      {/* Search Header */}
      <div className="p-3 border-b border-border">
        <div className="relative">
          <svg
            className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-content-muted"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search channels & DMs..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-elevated border border-border rounded-lg text-content-primary placeholder:text-content-muted focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent transition-all"
          />
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
                  onClick={() => setActiveConversation(conv.id)}
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
                      #
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
                  {conv.last_message && (
                    <span className="text-[10px] text-content-muted shrink-0 font-mono">
                      {formatTime(conv.last_message.created_at)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

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
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
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
                const isOnline = conv.other_user
                  ? onlineUserIds.includes(conv.other_user.id)
                  : false;

                return (
                  <button
                    key={conv.id}
                    onClick={() => setActiveConversation(conv.id)}
                    className={`w-full group flex items-center justify-between px-2.5 py-2 rounded-lg text-left transition-all active:scale-[0.98] ${
                      isActive
                        ? 'bg-accent-subtle text-accent font-semibold shadow-xs border border-accent/20'
                        : 'text-content-secondary hover:bg-floor hover:text-content-primary'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="relative shrink-0">
                        <div className="w-6 h-6 rounded-full bg-elevated text-content-primary text-[10px] font-bold flex items-center justify-center uppercase border border-border">
                          {conv.title.slice(0, 2)}
                        </div>
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-panel ${
                            isOnline ? 'bg-status-available' : 'bg-content-muted/40'
                          }`}
                        />
                      </div>
                      <div className="truncate">
                        <span className="text-xs truncate block font-medium">
                          {conv.title}
                        </span>
                        {conv.last_message && (
                          <span className="text-[10px] text-content-muted block truncate max-w-[140px]">
                            {conv.last_message.is_deleted
                              ? 'Message deleted'
                              : conv.last_message.content}
                          </span>
                        )}
                      </div>
                    </div>
                    {conv.last_message && (
                      <span className="text-[10px] text-content-muted shrink-0 font-mono">
                        {formatTime(conv.last_message.created_at)}
                      </span>
                    )}
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
};

