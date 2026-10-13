import React, { useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useChatStore, ChatMessage } from '../../store/chatStore';
import { Check, CheckCheck, Trash2, Edit2, CornerUpLeft } from 'lucide-react';

interface MessageItemProps {
  message: ChatMessage;
}

export const MessageItem: React.FC<MessageItemProps> = ({ message }) => {
  const currentUser = useAuthStore((s) => s.user);
  const setReplyingTo = useChatStore((s) => s.setReplyingTo);
  const editMessage = useChatStore((s) => s.editMessage);
  const deleteMessage = useChatStore((s) => s.deleteMessage);
  const activeConv = useChatStore((s) =>
    s.conversations.find((c) => c.id === message.conversation_id)
  );

  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);

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
      className={`group relative flex gap-3 px-5 py-2 hover:bg-panel/50 transition-colors ${
        message.status === 'sending' ? 'opacity-70' : ''
      }`}
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

        {/* Quoted reply preview if any */}
        {message.reply_to && !message.is_deleted && (
          <div className="mb-1.5 px-2.5 py-1 text-xs border-l-2 border-accent bg-elevated rounded-r-md text-content-muted flex items-center gap-1.5 border-t border-r border-b border-border/40">
            <span className="font-semibold text-content-primary">
              {message.reply_to.sender_name}:
            </span>
            <span className="truncate max-w-sm">{message.reply_to.content}</span>
          </div>
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
        <div className="absolute right-4 top-2 hidden group-hover:flex items-center gap-1 bg-elevated border border-border shadow-md rounded-lg p-1 z-10 animate-fade-in">
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
