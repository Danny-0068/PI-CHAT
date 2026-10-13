import React, { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useChatStore, ChatMessage } from '../../store/chatStore';
import { Check, CheckCheck, Trash2, Edit2, CornerUpLeft, Smile, Plus } from 'lucide-react';

interface MessageItemProps {
  message: ChatMessage;
}

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🎉', '🚀', '👀'];
const EXTENDED_EMOJIS = [
  '👍', '❤️', '😂', '🎉', '🚀', '👀',
  '🔥', '💯', '👏', '🙏', '✨', '💡',
  '✅', '❌', '🤔', '😎', '😍', '🙌'
];

export const MessageItem: React.FC<MessageItemProps> = ({ message }) => {
  const currentUser = useAuthStore((s) => s.user);
  const setReplyingTo = useChatStore((s) => s.setReplyingTo);
  const editMessage = useChatStore((s) => s.editMessage);
  const deleteMessage = useChatStore((s) => s.deleteMessage);
  const toggleReaction = useChatStore((s) => s.toggleReaction);
  const highlightedMessageId = useChatStore((s) => s.highlightedMessageId);
  const setHighlightedMessageId = useChatStore((s) => s.setHighlightedMessageId);

  const activeConv = useChatStore((s) =>
    s.conversations.find((c) => c.id === message.conversation_id)
  );

  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [showPicker, setShowPicker] = useState(false);
  const [showExtendedPicker, setShowExtendedPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const isHighlighted = highlightedMessageId === message.id;
  const isOwn = currentUser?.id === message.sender.id;
  const isAdmin = currentUser?.role === 'MAIN_ADMIN';
  const canDelete = !message.is_deleted && (isOwn || isAdmin);
  const canEdit = !message.is_deleted && isOwn;

  const isDM = activeConv?.type === 'DM';
  const isReadByRecipient =
    isOwn &&
    isDM &&
    Boolean(activeConv?.other_user_last_read_at) &&
    new Date(activeConv!.other_user_last_read_at!).getTime() >=
      new Date(message.created_at).getTime();

  const isLatestMessage = activeConv?.last_message?.id === message.id;

  // Close reaction popovers when clicking outside
  useEffect(() => {
    if (!showPicker && !showExtendedPicker) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
        setShowExtendedPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showPicker, showExtendedPicker]);

  const handleSaveEdit = async () => {
    if (editContent.trim() && editContent !== message.content) {
      await editMessage(message.id, editContent.trim());
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      setEditContent(message.content);
    }
  };

  const handleQuoteClick = () => {
    if (message.reply_to) {
      setHighlightedMessageId(message.reply_to.id);
      const target = document.getElementById(`msg-${message.reply_to.id}`);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  };

  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div
      id={`msg-${message.id}`}
      className={`group relative flex gap-3 px-5 py-2 transition-all duration-300 ${
        isHighlighted
          ? 'bg-accent/15 ring-2 ring-accent/40 rounded-lg shadow-xs'
          : 'hover:bg-panel/50'
      } ${message.status === 'sending' ? 'opacity-70' : ''}`}
    >
      {/* Avatar */}
      <div className="shrink-0 pt-0.5">
        <div className="w-8 h-8 rounded-full bg-elevated text-content-primary border border-border text-xs font-bold flex items-center justify-center uppercase select-none shadow-xs">
          {message.sender.display_name.slice(0, 2)}
        </div>
      </div>

      {/* Message Body */}
      <div className="flex-1 min-w-0">
        {/* Header (Sender Name, Role, Timestamp, Seen Receipts) */}
        <div className="flex items-baseline gap-2 mb-0.5">
          <span className="text-xs font-semibold text-content-primary">
            {message.sender.display_name}
          </span>
          {message.sender.role === 'MAIN_ADMIN' && (
            <span className="text-[10px] bg-accent-subtle text-accent font-medium px-1.5 py-0.2 rounded border border-accent/20">
              Admin
            </span>
          )}
          <span className="text-[10px] text-content-muted font-mono">
            {formatTime(message.created_at)}
          </span>

          {/* Read receipt checkmark for sender's messages */}
          {isOwn && isDM && message.status !== 'sending' && message.status !== 'error' && (
            <span
              className="inline-flex items-center"
              title={isReadByRecipient ? 'Seen by recipient' : 'Sent'}
            >
              {isReadByRecipient ? (
                <CheckCheck className="w-3.5 h-3.5 text-accent" />
              ) : (
                <Check className="w-3.5 h-3.5 text-content-muted" />
              )}
            </span>
          )}

          {message.is_edited && !message.is_deleted && (
            <span className="text-[10px] text-content-muted italic">(edited)</span>
          )}
          {message.status === 'sending' && (
            <span className="text-[10px] text-content-muted italic">sending...</span>
          )}
          {message.status === 'error' && (
            <span className="text-[10px] text-status-dnd font-medium">failed to send</span>
          )}
        </div>

        {/* Quoted reply preview if any with click-to-jump */}
        {message.reply_to && !message.is_deleted && (
          <button
            type="button"
            onClick={handleQuoteClick}
            title="Jump to quoted message"
            className="mb-1.5 px-2.5 py-1 text-xs border-l-2 border-accent bg-elevated/80 hover:bg-elevated rounded-r-md text-content-muted flex items-center gap-1.5 border-t border-r border-b border-border/40 text-left transition-colors cursor-pointer group/quote max-w-lg"
          >
            <CornerUpLeft className="w-3 h-3 text-accent shrink-0 group-hover/quote:scale-110 transition-transform" />
            <span className="font-semibold text-content-primary shrink-0">
              {message.reply_to.sender_name}:
            </span>
            <span className="truncate">{message.reply_to.content}</span>
          </button>
        )}

        {/* Content or Tombstone */}
        {message.is_deleted ? (
          <div className="flex items-center gap-1.5 text-xs text-content-muted italic py-0.5">
            <Trash2 className="w-3.5 h-3.5 opacity-60" />
            <span>This message was deleted</span>
          </div>
        ) : isEditing ? (
          <div className="mt-1 space-y-1.5">
            <input
              type="text"
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
              className="w-full text-xs px-2.5 py-1.5 bg-elevated border border-accent rounded-lg focus:outline-none focus:ring-1 focus:ring-accent text-content-primary"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={handleSaveEdit}
                className="text-[11px] px-2.5 py-1 bg-accent text-white font-medium rounded-md hover:bg-accent-hover active:scale-[0.97] transition-all"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setEditContent(message.content);
                }}
                className="text-[11px] px-2 py-1 text-content-muted hover:text-content-primary rounded-md active:scale-[0.97] transition-all"
              >
                Cancel
              </button>
              <span className="text-[10px] text-content-muted">
                (Enter to save, Esc to cancel)
              </span>
            </div>
          </div>
        ) : (
          <p className="text-xs text-content-primary/95 whitespace-pre-wrap break-words leading-relaxed">
            {message.content}
          </p>
        )}

        {/* Reaction badges under message */}
        {message.reactions && message.reactions.length > 0 && !message.is_deleted && (
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            {message.reactions.map((r) => {
              const hasReacted = Boolean(currentUser && r.user_ids.includes(currentUser.id));
              const tooltipText = `${r.user_names
                .map((name) => (currentUser && name === currentUser.display_name ? 'You' : name))
                .join(', ')} reacted with ${r.emoji}`;

              return (
                <button
                  key={r.emoji}
                  type="button"
                  onClick={() => toggleReaction(message.id, r.emoji)}
                  title={tooltipText}
                  className={`group/badge inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-all active:scale-95 ${
                    hasReacted
                      ? 'bg-accent/15 border border-accent/40 text-accent font-semibold shadow-2xs'
                      : 'bg-elevated hover:bg-panel border border-border text-content-secondary'
                  }`}
                >
                  <span className="text-[13px] leading-none group-hover/badge:scale-110 transition-transform">
                    {r.emoji}
                  </span>
                  <span className="text-[11px] leading-none font-medium">{r.count}</span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setShowPicker(true)}
              title="Add reaction"
              className="inline-flex items-center justify-center w-6 h-5 rounded-full bg-elevated hover:bg-panel border border-border text-content-muted hover:text-content-primary text-xs transition-all active:scale-95"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Subtle "Seen" label under latest message in DM if read */}
        {isOwn && isDM && isLatestMessage && isReadByRecipient && !message.is_deleted && (
          <div className="flex items-center gap-1 mt-1 text-[10px] text-accent font-medium select-none">
            <CheckCheck className="w-3 h-3 text-accent" />
            <span>Seen</span>
          </div>
        )}
      </div>

      {/* Hover action toolbar */}
      {!message.is_deleted && (
        <div
          className={`absolute right-4 top-2 ${
            showPicker || showExtendedPicker ? 'flex' : 'hidden group-hover:flex'
          } items-center gap-1 bg-elevated border border-border shadow-md rounded-lg p-1 z-20 animate-fade-in`}
        >
          {/* Reaction Picker Popover */}
          <div className="relative" ref={pickerRef}>
            <button
              onClick={() => setShowPicker(!showPicker)}
              title="Add reaction"
              className={`p-1 rounded-md active:scale-[0.95] transition-all ${
                showPicker || showExtendedPicker
                  ? 'bg-accent-subtle text-accent'
                  : 'text-content-muted hover:text-content-primary hover:bg-floor'
              }`}
            >
              <Smile className="w-3.5 h-3.5" />
            </button>

            {(showPicker || showExtendedPicker) && (
              <div className="absolute right-0 bottom-full mb-1.5 bg-elevated border border-border rounded-xl shadow-xl p-2 z-50 animate-scale-in">
                {showExtendedPicker ? (
                  <div>
                    <div className="text-[10px] font-semibold text-content-muted uppercase tracking-wider px-1 mb-1.5 flex items-center justify-between">
                      <span>Reactions</span>
                      <button
                        onClick={() => setShowExtendedPicker(false)}
                        className="text-content-muted hover:text-content-primary text-[10px]"
                      >
                        Fewer
                      </button>
                    </div>
                    <div className="grid grid-cols-6 gap-1 w-52">
                      {EXTENDED_EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => {
                            toggleReaction(message.id, emoji);
                            setShowPicker(false);
                            setShowExtendedPicker(false);
                          }}
                          className="w-8 h-8 flex items-center justify-center text-base rounded-md hover:bg-panel hover:scale-120 active:scale-95 transition-transform"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    {QUICK_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => {
                          toggleReaction(message.id, emoji);
                          setShowPicker(false);
                        }}
                        className="w-7 h-7 flex items-center justify-center text-sm rounded-md hover:bg-panel hover:scale-125 active:scale-95 transition-transform"
                      >
                        {emoji}
                      </button>
                    ))}
                    <button
                      onClick={() => setShowExtendedPicker(true)}
                      title="More emojis"
                      className="w-7 h-7 flex items-center justify-center text-xs text-content-muted hover:text-content-primary hover:bg-panel rounded-md transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            onClick={() => setReplyingTo(message)}
            title="Reply"
            className="p-1 text-content-muted hover:text-content-primary hover:bg-floor rounded-md active:scale-[0.95] transition-all"
          >
            <CornerUpLeft className="w-3.5 h-3.5" />
          </button>

          {canEdit && (
            <button
              onClick={() => setIsEditing(true)}
              title="Edit"
              className="p-1 text-content-muted hover:text-content-primary hover:bg-floor rounded-md active:scale-[0.95] transition-all"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          )}

          {canDelete && (
            <button
              onClick={() => deleteMessage(message.id)}
              title="Delete"
              className="p-1 text-content-muted hover:text-status-dnd hover:bg-status-dnd/10 rounded-md active:scale-[0.95] transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};
