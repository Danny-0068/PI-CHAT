import { create } from 'zustand';
import { apiFetch } from '../lib/api';
import { socketManager } from '../lib/socket';
import { useAuthStore, UserStatus } from './authStore';

export type ConversationType = 'DM' | 'TEAM_GROUP' | 'UPDATES';

export interface MessageSender {
  id: string;
  display_name: string;
  email: string;
  role: string;
  status?: string;
  status_text?: string | null;
}

export interface ReplySnippet {
  id: string;
  sender_name: string;
  content: string;
}

export interface ReactionSummary {
  emoji: string;
  count: number;
  user_ids: string[];
  user_names: string[];
}

export interface ChatMessage {
  id: string;
  client_id: string;
  conversation_id: string;
  sender: MessageSender;
  content: string;
  is_edited: boolean;
  is_deleted: boolean;
  reply_to: ReplySnippet | null;
  reactions?: ReactionSummary[];
  created_at: string;
  updated_at: string;
  status?: 'sending' | 'sent' | 'error';
}

export interface ConversationItem {
  id: string;
  type: ConversationType;
  title: string;
  slug: string | null;
  color: string | null;
  team_id: string | null;
  other_user: MessageSender | null;
  last_message: ChatMessage | null;
  unread_count: number;
  updated_at: string;
  my_last_read_at?: string | null;
  other_user_last_read_at?: string | null;
}

export const sortConversations = (convs: ConversationItem[]): ConversationItem[] => {
  return [...convs].sort((a, b) => {
    // #updates always pinned on top
    if (a.type === 'UPDATES' && b.type !== 'UPDATES') return -1;
    if (b.type === 'UPDATES' && a.type !== 'UPDATES') return 1;

    // Dynamic chronological ordering by latest message / activity timestamp
    const timeA = new Date(a.last_message?.created_at || a.updated_at).getTime();
    const timeB = new Date(b.last_message?.created_at || b.updated_at).getTime();
    return timeB - timeA;
  });
};

interface ChatState {
  conversations: ConversationItem[];
  activeConversationId: string | null;
  messages: Record<string, ChatMessage[]>; // conversationId -> messages
  isLoadingConversations: boolean;
  isLoadingMessages: boolean;
  typingUsers: Record<string, string[]>; // conversationId -> user display names
  onlineUserIds: string[];
  replyingTo: ChatMessage | null;
  highlightedMessageId: string | null;

  // Actions
  initRealtime: () => void;
  fetchConversations: () => Promise<void>;
  setActiveConversation: (id: string) => Promise<void>;
  fetchMessages: (conversationId: string) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  editMessage: (messageId: string, content: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  setReplyingTo: (msg: ChatMessage | null) => void;
  setHighlightedMessageId: (id: string | null) => void;
  startDM: (targetUserId: string) => Promise<ConversationItem>;
  markAsRead: (conversationId: string) => Promise<void>;
  updateMyStatus: (status: UserStatus, statusText?: string | null) => Promise<void>;
  toggleReaction: (messageId: string, emoji: string) => Promise<void>;

  // Socket event listeners
  handleIncomingMessage: (msg: ChatMessage) => void;
  handleMessageUpdated: (msg: ChatMessage) => void;
  handleMessageDeleted: (msg: ChatMessage) => void;
  handleUserTyping: (conversationId: string, displayName: string) => void;
  handleUserStopTyping: (conversationId: string, userId: string) => void;
  handleUserPresence: (userId: string, status: string) => void;
  handleConversationRead: (data: { conversation_id: string; user_id: string; last_read_at: string }) => void;
  handleUserStatusChanged: (data: { user_id: string; status: string; status_text?: string | null }) => void;
  handleMessageReactionToggled: (data: { message_id: string; conversation_id: string; reactions: ReactionSummary[] }) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  messages: {},
  isLoadingConversations: false,
  isLoadingMessages: false,
  typingUsers: {},
  onlineUserIds: [],
  replyingTo: null,
  highlightedMessageId: null,

  initRealtime: () => {
    socketManager.setHandlers({
      onMessageReceived: (msg) => get().handleIncomingMessage(msg),
      onMessageUpdated: (msg) => get().handleMessageUpdated(msg),
      onMessageDeleted: (msg) => get().handleMessageDeleted(msg),
      onUserTyping: (convId, displayName) => get().handleUserTyping(convId, displayName),
      onUserStopTyping: (convId, userId) => get().handleUserStopTyping(convId, userId),
      onUserPresence: (userId, status) => get().handleUserPresence(userId, status),
      onConversationRead: (data) => get().handleConversationRead(data),
      onUserStatusChanged: (data) => get().handleUserStatusChanged(data),
      onMessageReactionToggled: (data) => get().handleMessageReactionToggled(data),
      onReconnect: () => {
        const activeId = get().activeConversationId;
        if (activeId) {
          get().fetchMessages(activeId);
        }
      },
    });
    socketManager.connect();
  },

  setHighlightedMessageId: (id: string | null) => {
    set({ highlightedMessageId: id });
    if (id) {
      setTimeout(() => {
        if (get().highlightedMessageId === id) {
          set({ highlightedMessageId: null });
        }
      }, 2000);
    }
  },

  fetchConversations: async () => {
    get().initRealtime();
    set({ isLoadingConversations: true });
    try {
      const data = await apiFetch<ConversationItem[]>('/conversations');
      const sorted = sortConversations(data);
      set({ conversations: sorted, isLoadingConversations: false });

      // Automatically select the first conversation if none active
      const state = get();
      if (!state.activeConversationId && sorted.length > 0) {
        state.setActiveConversation(sorted[0].id);
      }
    } catch (err) {
      console.error('Failed to load conversations:', err);
      set({ isLoadingConversations: false });
    }
  },

  setActiveConversation: async (id: string) => {
    const currentActive = get().activeConversationId;
    if (currentActive && currentActive !== id) {
      socketManager.leaveConversation(currentActive);
    }

    set({ activeConversationId: id, replyingTo: null });
    socketManager.joinConversation(id);
    get().markAsRead(id);
    await get().fetchMessages(id);
  },

  markAsRead: async (conversationId: string) => {
    const currentUser = useAuthStore.getState().user;
    if (!currentUser) return;
    const now = new Date().toISOString();

    // Optimistically update conversation
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId
          ? { ...c, unread_count: 0, my_last_read_at: now }
          : c
      ),
    }));

    // Send via socket and REST fallback
    socketManager.markRead(conversationId);
    try {
      await apiFetch(`/conversations/${conversationId}/read`, { method: 'POST' });
    } catch {
      // Handled via socket or silent
    }
  },

  updateMyStatus: async (status: UserStatus, statusText?: string | null) => {
    try {
      useAuthStore.getState().updateStatus(status, statusText);
      socketManager.emitStatusUpdate(status, statusText);
      await apiFetch('/users/me/status', {
        method: 'PATCH',
        body: JSON.stringify({ status, status_text: statusText }),
      });
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  },

  fetchMessages: async (conversationId: string) => {
    set({ isLoadingMessages: true });
    try {
      const data = await apiFetch<ChatMessage[]>(`/conversations/${conversationId}/messages?limit=50`);
      set((state) => ({
        messages: {
          ...state.messages,
          [conversationId]: data,
        },
        isLoadingMessages: false,
      }));
    } catch (err) {
      console.error(`Failed to load messages for ${conversationId}:`, err);
      set({ isLoadingMessages: false });
    }
  },

  sendMessage: async (content: string) => {
    const activeId = get().activeConversationId;
    const currentUser = useAuthStore.getState().user;
    if (!activeId || !currentUser || !content.trim()) return;

    const clientId = `client-${crypto.randomUUID()}`;
    const replyingTo = get().replyingTo;

    // Optimistic message
    const optimisticMessage: ChatMessage = {
      id: clientId,
      client_id: clientId,
      conversation_id: activeId,
      sender: {
        id: currentUser.id,
        display_name: currentUser.display_name,
        email: currentUser.email,
        role: currentUser.role,
        status: currentUser.status,
        status_text: currentUser.status_text,
      },
      content,
      is_edited: false,
      is_deleted: false,
      reply_to: replyingTo
        ? {
            id: replyingTo.id,
            sender_name: replyingTo.sender.display_name,
            content: replyingTo.content.slice(0, 100),
          }
        : null,
      reactions: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status: 'sending',
    };

    // Update state optimistically and clear replyingTo
    set((state) => {
      const updatedConvs = state.conversations.map((c) =>
        c.id === activeId
          ? { ...c, last_message: optimisticMessage, updated_at: optimisticMessage.created_at }
          : c
      );
      return {
        replyingTo: null,
        messages: {
          ...state.messages,
          [activeId]: [...(state.messages[activeId] || []), optimisticMessage],
        },
        conversations: sortConversations(updatedConvs),
      };
    });

    try {
      const socket = socketManager.getSocket();
      if (socket && socket.connected) {
        // Realtime dispatch
        socket.emit(
          'send_message',
          {
            conversation_id: activeId,
            client_id: clientId,
            content,
            reply_to_id: replyingTo?.id || null,
          },
          (response: any) => {
            if (response && response.status === 'error') {
              console.error('Socket message send failed:', response.message);
            }
          }
        );
      } else {
        // REST fallback
        const saved = await apiFetch<ChatMessage>(`/conversations/${activeId}/messages`, {
          method: 'POST',
          body: JSON.stringify({
            client_id: clientId,
            content,
            reply_to_id: replyingTo?.id || null,
          }),
        });
        get().handleIncomingMessage(saved);
      }
    } catch (err) {
      console.error('Failed to send message:', err);
      // Mark optimistic message as error
      set((state) => ({
        messages: {
          ...state.messages,
          [activeId]: (state.messages[activeId] || []).map((m) =>
            m.client_id === clientId ? { ...m, status: 'error' } : m
          ),
        },
      }));
    }
  },

  editMessage: async (messageId: string, content: string) => {
    try {
      const socket = socketManager.getSocket();
      if (socket && socket.connected) {
        socket.emit('edit_message', { message_id: messageId, content });
      } else {
        const updated = await apiFetch<ChatMessage>(`/conversations/messages/${messageId}`, {
          method: 'PATCH',
          body: JSON.stringify({ content }),
        });
        get().handleMessageUpdated(updated);
      }
    } catch (err) {
      console.error('Failed to edit message:', err);
    }
  },

  deleteMessage: async (messageId: string) => {
    try {
      const socket = socketManager.getSocket();
      if (socket && socket.connected) {
        socket.emit('delete_message', { message_id: messageId });
      } else {
        const deleted = await apiFetch<ChatMessage>(`/conversations/messages/${messageId}`, {
          method: 'DELETE',
        });
        get().handleMessageDeleted(deleted);
      }
    } catch (err) {
      console.error('Failed to delete message:', err);
    }
  },

  setReplyingTo: (msg: ChatMessage | null) => {
    set({ replyingTo: msg });
  },

  startDM: async (targetUserId: string) => {
    const res = await apiFetch<ConversationItem>('/conversations/dm', {
      method: 'POST',
      body: JSON.stringify({ target_user_id: targetUserId }),
    });

    set((state) => {
      const existing = state.conversations.find((c) => c.id === res.id);
      if (existing) {
        return { activeConversationId: res.id };
      }
      return {
        conversations: sortConversations([...state.conversations, res]),
        activeConversationId: res.id,
      };
    });

    await get().setActiveConversation(res.id);
    return res;
  },

  toggleReaction: async (messageId: string, emoji: string) => {
    const currentUser = useAuthStore.getState().user;
    if (!currentUser) return;

    // Optimistic toggle
    set((state) => {
      const activeId = state.activeConversationId;
      if (!activeId || !state.messages[activeId]) return state;

      const msgs = state.messages[activeId].map((m) => {
        if (m.id !== messageId) return m;
        const currentReactions = m.reactions || [];
        const existingIdx = currentReactions.findIndex((r) => r.emoji === emoji);

        let newReactions: ReactionSummary[];
        if (existingIdx >= 0) {
          const current = currentReactions[existingIdx];
          const hasUser = current.user_ids.includes(currentUser.id);
          if (hasUser) {
            if (current.count <= 1) {
              newReactions = currentReactions.filter((r) => r.emoji !== emoji);
            } else {
              newReactions = currentReactions.map((r, i) =>
                i === existingIdx
                  ? {
                      ...r,
                      count: r.count - 1,
                      user_ids: r.user_ids.filter((id) => id !== currentUser.id),
                      user_names: r.user_names.filter((name) => name !== currentUser.display_name),
                    }
                  : r
              );
            }
          } else {
            newReactions = currentReactions.map((r, i) =>
              i === existingIdx
                ? {
                    ...r,
                    count: r.count + 1,
                    user_ids: [...r.user_ids, currentUser.id],
                    user_names: [...r.user_names, currentUser.display_name],
                  }
                : r
            );
          }
        } else {
          newReactions = [
            ...currentReactions,
            {
              emoji,
              count: 1,
              user_ids: [currentUser.id],
              user_names: [currentUser.display_name],
            },
          ];
        }
        return { ...m, reactions: newReactions };
      });

      return {
        messages: {
          ...state.messages,
          [activeId]: msgs,
        },
      };
    });

    socketManager.toggleReaction(messageId, emoji);
    try {
      await apiFetch(`/conversations/messages/${messageId}/reactions`, {
        method: 'POST',
        body: JSON.stringify({ emoji }),
      });
    } catch {
      // Handled via socket
    }
  },

  handleIncomingMessage: (msg: ChatMessage) => {
    const currentUser = useAuthStore.getState().user;
    const activeId = get().activeConversationId;
    const isFromMe = currentUser && msg.sender.id === currentUser.id;

    set((state) => {
      const convMsgs = state.messages[msg.conversation_id] || [];
      const existingIdx = convMsgs.findIndex(
        (m) => m.id === msg.id || m.client_id === msg.client_id
      );

      let updatedMsgs: ChatMessage[];
      if (existingIdx >= 0) {
        updatedMsgs = [...convMsgs];
        updatedMsgs[existingIdx] = { ...msg, status: 'sent' };
      } else {
        updatedMsgs = [...convMsgs, { ...msg, status: 'sent' }];
      }

      // Update last_message and unread_count
      const updatedConvs = state.conversations.map((c) => {
        if (c.id === msg.conversation_id) {
          const isCurrentlyActive = activeId === msg.conversation_id;
          const newUnread = isCurrentlyActive || isFromMe ? 0 : (c.unread_count || 0) + 1;
          return {
            ...c,
            last_message: msg,
            updated_at: msg.created_at,
            unread_count: newUnread,
          };
        }
        return c;
      });

      return {
        messages: {
          ...state.messages,
          [msg.conversation_id]: updatedMsgs,
        },
        conversations: sortConversations(updatedConvs),
      };
    });

    if (activeId === msg.conversation_id && !isFromMe) {
      get().markAsRead(msg.conversation_id);
    }
  },

  handleMessageUpdated: (msg: ChatMessage) => {
    set((state) => {
      const convMsgs = state.messages[msg.conversation_id] || [];
      return {
        messages: {
          ...state.messages,
          [msg.conversation_id]: convMsgs.map((m) =>
            m.id === msg.id ? { ...m, ...msg } : m
          ),
        },
      };
    });
  },

  handleMessageDeleted: (msg: ChatMessage) => {
    set((state) => {
      const convMsgs = state.messages[msg.conversation_id] || [];
      return {
        messages: {
          ...state.messages,
          [msg.conversation_id]: convMsgs.map((m) =>
            m.id === msg.id
              ? {
                  ...m,
                  is_deleted: true,
                  content: 'This message was deleted',
                  reactions: [],
                }
              : m
          ),
        },
      };
    });
  },

  handleUserTyping: (conversationId: string, displayName: string) => {
    set((state) => {
      const current = state.typingUsers[conversationId] || [];
      if (!current.includes(displayName)) {
        return {
          typingUsers: {
            ...state.typingUsers,
            [conversationId]: [...current, displayName],
          },
        };
      }
      return state;
    });
  },

  handleUserStopTyping: (conversationId: string, _userId: string) => {
    set((state) => {
      return {
        typingUsers: {
          ...state.typingUsers,
          [conversationId]: [],
        },
      };
    });
  },

  handleUserPresence: (userId: string, status: string) => {
    set((state) => {
      const online = new Set(state.onlineUserIds);
      if (status === 'online') {
        online.add(userId);
      } else {
        online.delete(userId);
      }
      return { onlineUserIds: Array.from(online) };
    });
  },

  handleConversationRead: (data: { conversation_id: string; user_id: string; last_read_at: string }) => {
    const currentUser = useAuthStore.getState().user;
    if (!currentUser) return;

    set((state) => ({
      conversations: state.conversations.map((c) => {
        if (c.id !== data.conversation_id) return c;
        if (data.user_id === currentUser.id) {
          return { ...c, unread_count: 0, my_last_read_at: data.last_read_at };
        } else {
          return { ...c, other_user_last_read_at: data.last_read_at };
        }
      }),
    }));
  },

  handleUserStatusChanged: (data: { user_id: string; status: string; status_text?: string | null }) => {
    const currentUser = useAuthStore.getState().user;
    if (currentUser && currentUser.id === data.user_id) {
      useAuthStore.getState().updateStatus(data.status as UserStatus, data.status_text);
    }

    set((state) => ({
      conversations: state.conversations.map((c) => {
        if (c.other_user?.id === data.user_id) {
          return {
            ...c,
            other_user: {
              ...c.other_user,
              status: data.status,
              status_text: data.status_text,
            },
          };
        }
        return c;
      }),
    }));
  },

  handleMessageReactionToggled: (data: { message_id: string; conversation_id: string; reactions: ReactionSummary[] }) => {
    set((state) => {
      const convMsgs = state.messages[data.conversation_id] || [];
      return {
        messages: {
          ...state.messages,
          [data.conversation_id]: convMsgs.map((m) =>
            m.id === data.message_id ? { ...m, reactions: data.reactions } : m
          ),
        },
      };
    });
  },
}));
