import React, { useState, useRef, useEffect } from 'react';
import { useChatStore } from '../../store/chatStore';
import { socketManager } from '../../lib/socket';

export const MessageInput: React.FC = () => {
  const [content, setContent] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const replyingTo = useChatStore((s) => s.replyingTo);
  const setReplyingTo = useChatStore((s) => s.setReplyingTo);
  const sendMessage = useChatStore((s) => s.sendMessage);

  // Auto-focus input when conversation changes
  useEffect(() => {
    textareaRef.current?.focus();
  }, [activeConversationId]);

  const handleSend = async () => {
    if (!content.trim() || !activeConversationId) return;

    const messageText = content.trim();
    setContent('');

    // Stop typing immediately on send
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    socketManager.emitTyping(activeConversationId, false);

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    await sendMessage(messageText);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);

    // Auto resize height up to 160px
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
    }

    // Typing indicator
    if (activeConversationId) {
      socketManager.emitTyping(activeConversationId, true);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = setTimeout(() => {
        socketManager.emitTyping(activeConversationId, false);
      }, 1500);
    }
  };

  return (
    <div className="p-3 border-t border-border bg-panel shrink-0">
      {/* Replying banner */}
      {replyingTo && (
        <div className="mb-2 px-3 py-1.5 bg-elevated border border-border rounded-lg flex items-center justify-between text-xs animate-fade-in shadow-xs">
          <div className="flex items-center gap-1.5 truncate">
            <svg className="w-3.5 h-3.5 text-accent shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
            <span className="font-semibold text-content-primary">
              Replying to {replyingTo.sender.display_name}:
            </span>
            <span className="text-content-muted truncate max-w-md">
              {replyingTo.content}
            </span>
          </div>
          <button
            onClick={() => setReplyingTo(null)}
            className="text-content-muted hover:text-content-primary p-0.5 rounded transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Input container */}
      <div className="flex items-end gap-2 bg-elevated border border-border rounded-xl p-1.5 focus-within:ring-1 focus-within:ring-accent focus-within:border-accent transition-all shadow-xs">
        <textarea
          ref={textareaRef}
          rows={1}
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Message... (Enter to send, Shift+Enter for new line)"
          className="w-full resize-none bg-transparent px-3 py-1.5 text-xs text-content-primary placeholder:text-content-muted focus:outline-none max-h-40 leading-relaxed"
        />

        <button
          onClick={handleSend}
          disabled={!content.trim()}
          className={`p-2 rounded-lg font-medium text-xs flex items-center justify-center transition-all ${
            content.trim()
              ? 'bg-accent text-white hover:bg-accent-hover active:scale-[0.96] shadow-xs'
              : 'text-content-muted/40 cursor-not-allowed'
          }`}
          title="Send message"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </div>
    </div>
  );
};

