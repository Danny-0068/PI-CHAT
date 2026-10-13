import { create } from 'zustand';
import { apiFetch } from '../lib/api';
import { socketManager } from '../lib/socket';
import { useAuthStore } from './authStore';

export type ConversationType = 'DM' | 'TEAM_GROUP' | 'UPDATES';

export interface MessageSender {
  id: string;
  display_name: string;
  email: string;
  role: string;
}

export interface ReplySnippet {
  id: string;
  sender_name: string;
  content: string;
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
}

interface ChatState {
  conversations: ConversationItem[];
  activeConversationId: string | null;
  messages: Record<string, ChatMessage[]>; // conversationId -> messages
  isLoadingConversations: boolean;
  isLoadingMessages: boolean;
  typingUsers: Record<string, string[]>; // conversationId -> user display names
  onlineUserIds: string[];
  replyingTo: ChatMessage | null;

  // Actions
  initRealtime: () => void;
  fetchConversations: () => Promise<void>;
  setActiveConversation: (id: string) => Promise<void>;
  fetchMessages: (conversationId: string) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  editMessage: (messageId: string, content: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  setReplyingTo: (msg: ChatMessage | null) => void;
  startDM: (targetUserId: string) => Promise<ConversationItem>;

  // Socket event listeners
  handleIncomingMessage: (msg: ChatMessage) => void;
  handleMessageUpdated: (msg: ChatMessage) => void;
  handleMessageDeleted: (msg: ChatMessage) => void;
  handleUserTyping: (conversationId: string, displayName: string) => void;
  handleUserStopTyping: (conversationId: string, userId: string) => void;
  handleUserPresence: (userId: string, status: string) => void;
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

  initRealtime: () => {
    socketManager.setHandlers({
      onMessageReceived: (msg) => get().handleIncomingMessage(msg),
      onMessageUpdated: (msg) => get().handleMessageUpdated(msg),
      onMessageDeleted: (msg) => get().handleMessageDeleted(msg),
      onUserTyping: (convId, displayName) => get().handleUserTyping(convId, displayName),
      onUserStopTyping: (convId, userId) => get().handleUserStopTyping(convId, userId),
      onUserPresence: (userId, status) => get().handleUserPresence(userId, status),
      onReconnect: () => {
        const activeId = get().activeConversationId;
        if (activeId) {
          get().fetchMessages(activeId);
        }
      },
    });
    socketManager.connect();
  },

  fetchConversations: async () => {
    get().initRealtime();
    set({ isLoadingConversations: true });
    try {
      const data = await apiFetch<ConversationItem[]>('/conversations');
      set({ conversations: data, isLoadingConversations: false });

      // Automatically select the first conversation if none active
      const state = get();
      if (!state.activeConversationId && data.length > 0) {
        state.setActiveConversation(data[0].id);
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
    await get().fetchMessages(id);
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
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status: 'sending',
    };

    // Update state optimistically and clear replyingTo
    set((state) => ({
      replyingTo: null,
      messages: {
        ...state.messages,
        [activeId]: [...(state.messages[activeId] || []), optimisticMessage],
      },
    }));

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
        conversations: [...state.conversations, res],
        activeConversationId: res.id,
      };
    });

    await get().setActiveConversation(res.id);
    return res;
  },

  handleIncomingMessage: (msg: ChatMessage) => {
    set((state) => {
      const convMsgs = state.messages[msg.conversation_id] || [];
      // Check if message is already present (by id or by client_id)
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

      // Update last_message in conversation list
      const updatedConvs = state.conversations.map((c) =>
        c.id === msg.conversation_id
          ? { ...c, last_message: msg, updated_at: msg.created_at }
          : c
      );

      return {
        messages: {
          ...state.messages,
          [msg.conversation_id]: updatedMsgs,
        },
        conversations: updatedConvs,
      };
    });
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
      // Clear typing indicator for conversation
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
}));
