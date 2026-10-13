import React, { useEffect, useRef } from 'react';
import { useChatStore } from '../../store/chatStore';
import { MessageItem } from './MessageItem';

export const MessageList: React.FC = () => {
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const messagesMap = useChatStore((s) => s.messages);
  const isLoadingMessages = useChatStore((s) => s.isLoadingMessages);
  const typingUsers = useChatStore((s) => s.typingUsers);

  const messages = activeConversationId ? messagesMap[activeConversationId] || [] : [];
  const currentTyping = activeConversationId ? typingUsers[activeConversationId] || [] : [];

  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, currentTyping.length]);

  if (!activeConversationId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-floor">
        <div className="w-12 h-12 rounded-2xl bg-panel text-content-muted border border-border flex items-center justify-center mb-3 shadow-xs">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <h3 className="text-sm font-semibold text-content-primary mb-1">No conversation selected</h3>
        <p className="text-xs text-content-muted max-w-xs">
          Choose a channel or direct message from the left panel to join the conversation.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={scrollContainerRef}
      className="flex-1 overflow-y-auto py-3 space-y-1 bg-floor scroll-smooth"
    >
      {isLoadingMessages && messages.length === 0 ? (
        <div className="flex items-center justify-center h-full">
          <div className="flex items-center gap-2 text-xs text-content-muted">
            <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <span>Loading message history...</span>
          </div>
        </div>
      ) : messages.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-center px-4">
          <div className="w-10 h-10 rounded-full bg-accent-subtle text-accent border border-accent/20 flex items-center justify-center mb-2">
            💬
          </div>
          <p className="text-xs font-semibold text-content-primary">No messages yet</p>
          <p className="text-[11px] text-content-muted mt-0.5">
            Be the first to say hello in this conversation!
          </p>
        </div>
      ) : (
        messages.map((msg) => <MessageItem key={msg.id || msg.client_id} message={msg} />)
      )}

      {/* Typing indicator */}
      {currentTyping.length > 0 && (
        <div className="px-5 py-1.5 flex items-center gap-2 text-xs text-content-muted">
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-accent/60 rounded-full animate-bounce" />
            <span className="w-1.5 h-1.5 bg-accent/60 rounded-full animate-bounce [animation-delay:0.2s]" />
            <span className="w-1.5 h-1.5 bg-accent/60 rounded-full animate-bounce [animation-delay:0.4s]" />
          </div>
          <span className="text-[11px] italic">
            {currentTyping.join(', ')} {currentTyping.length === 1 ? 'is' : 'are'} typing...
          </span>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
};

