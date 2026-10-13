import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { useAuthStore } from '../../store/authStore';
import { useChatStore } from '../../store/chatStore';

interface UserDirectoryItem {
  id: string;
  email: string;
  display_name: string;
  role: string;
  status: string;
  status_text: string | null;
}

interface NewDMModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewDMModal: React.FC<NewDMModalProps> = ({ isOpen, onClose }) => {
  const [users, setUsers] = useState<UserDirectoryItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);

  const currentUser = useAuthStore((s) => s.user);
  const startDM = useChatStore((s) => s.startDM);
  const onlineUserIds = useChatStore((s) => s.onlineUserIds);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      apiFetch<UserDirectoryItem[]>('/users')
        .then((data) => {
          // Exclude self
          setUsers(data.filter((u) => u.id !== currentUser?.id));
        })
        .catch((err) => console.error('Failed to load users for DM:', err))
        .finally(() => setLoading(false));
    }
  }, [isOpen, currentUser?.id]);

  if (!isOpen) return null;

  const filteredUsers = users.filter((u) =>
    u.display_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelectUser = async (targetUserId: string) => {
    setStarting(true);
    try {
      await startDM(targetUserId);
      onClose();
    } catch (err) {
      console.error('Failed to start DM:', err);
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div
        className="w-full max-w-md bg-panel border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent-subtle text-accent flex items-center justify-center font-semibold text-sm border border-accent/20">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-content-primary text-sm">New Direct Message</h3>
              <p className="text-xs text-content-muted">Select a teammate to start a chat</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-content-muted hover:text-content-primary p-1 rounded-md hover:bg-floor transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-border bg-panel">
          <div className="relative">
            <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              autoFocus
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-elevated border border-border rounded-lg text-content-primary placeholder:text-content-muted focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent"
            />
          </div>
        </div>

        {/* User list */}
        <div className="overflow-y-auto flex-1 divide-y divide-border/40 p-1">
          {loading ? (
            <div className="py-8 text-center text-xs text-content-muted">
              Loading teammates...
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="py-8 text-center text-xs text-content-muted">
              {searchTerm ? 'No teammates match your search.' : 'No other teammates found.'}
            </div>
          ) : (
            filteredUsers.map((u) => {
              const isOnline = onlineUserIds.includes(u.id);
              return (
                <button
                  key={u.id}
                  disabled={starting}
                  onClick={() => handleSelectUser(u.id)}
                  className="w-full flex items-center justify-between p-2.5 rounded-lg text-left hover:bg-floor active:scale-[0.99] transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="w-8 h-8 rounded-full bg-elevated text-content-primary border border-border flex items-center justify-center font-bold text-xs uppercase shadow-xs">
                        {u.display_name.slice(0, 2)}
                      </div>
                      <span
                        className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-panel ${
                          isOnline ? 'bg-status-available' : 'bg-content-muted/40'
                        }`}
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-content-primary group-hover:text-accent transition-colors">
                          {u.display_name}
                        </span>
                        {u.role === 'MAIN_ADMIN' && (
                          <span className="text-[10px] bg-accent-subtle text-accent font-medium px-1.5 py-0.2 rounded border border-accent/20">
                            Admin
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-content-muted block truncate max-w-[200px]">
                        {u.status_text || u.email}
                      </span>
                    </div>
                  </div>
                  <div className="text-content-muted group-hover:text-accent transition-colors pr-1">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
