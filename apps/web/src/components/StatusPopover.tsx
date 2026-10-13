import React, { useState, useRef, useEffect } from 'react';
import { useAuthStore, UserStatus } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { Check, Sparkles, X } from 'lucide-react';

interface StatusPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  anchorRef?: React.RefObject<HTMLElement | null>;
}

const PRESETS = [
  'Deep focus mode',
  'In a meeting',
  'Out for lunch',
  'Traveling',
  'Wrapping up for today',
];

export const StatusPopover: React.FC<StatusPopoverProps> = ({
  isOpen,
  onClose,
  anchorRef,
}) => {
  const user = useAuthStore((s) => s.user);
  const updateMyStatus = useChatStore((s) => s.updateMyStatus);

  const [selectedStatus, setSelectedStatus] = useState<UserStatus>(user?.status || 'AVAILABLE');
  const [statusText, setStatusText] = useState(user?.status_text || '');
  const [isSaving, setIsSaving] = useState(false);

  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user) {
      setSelectedStatus(user.status);
      setStatusText(user.status_text || '');
    }
  }, [user, isOpen]);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        (!anchorRef?.current || !anchorRef.current.contains(e.target as Node))
      ) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, anchorRef]);

  if (!isOpen || !user) return null;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateMyStatus(selectedStatus, statusText.trim() || null);
      onClose();
    } catch (err) {
      console.error('Failed to save status:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearText = () => {
    setStatusText('');
  };

  return (
    <div
      ref={popoverRef}
      className="absolute top-12 right-0 sm:right-auto sm:left-0 w-80 bg-panel border border-border rounded-xl shadow-xl p-4 z-50 animate-fade-in text-content-primary select-none backdrop-blur-md"
    >
      <div className="flex items-center justify-between pb-3 border-b border-border mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent" />
          <span className="text-xs font-semibold">Set Presence & Status</span>
        </div>
        <button
          onClick={onClose}
          className="text-content-muted hover:text-content-primary p-1 rounded-md transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Availability Mode Selector */}
      <div className="space-y-1.5 mb-4">
        <label className="text-[11px] font-semibold text-content-muted uppercase tracking-wider">
          Availability Mode
        </label>
        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={() => setSelectedStatus('AVAILABLE')}
            className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-medium border transition-all active:scale-[0.98] ${
              selectedStatus === 'AVAILABLE'
                ? 'bg-status-available/10 border-status-available/40 text-status-available font-semibold shadow-xs'
                : 'bg-elevated border-border text-content-secondary hover:bg-floor hover:text-content-primary'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-status-available shrink-0" />
            <span>Online</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedStatus('AWAY')}
            className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-medium border transition-all active:scale-[0.98] ${
              selectedStatus === 'AWAY'
                ? 'bg-status-away/10 border-status-away/40 text-status-away font-semibold shadow-xs'
                : 'bg-elevated border-border text-content-secondary hover:bg-floor hover:text-content-primary'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-status-away shrink-0" />
            <span>Away</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedStatus('DND')}
            className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-medium border transition-all active:scale-[0.98] ${
              selectedStatus === 'DND'
                ? 'bg-status-dnd/10 border-status-dnd/40 text-status-dnd font-semibold shadow-xs'
                : 'bg-elevated border-border text-content-secondary hover:bg-floor hover:text-content-primary'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-status-dnd shrink-0" />
            <span>DND</span>
          </button>
        </div>
      </div>

      {/* Custom Status Text Input */}
      <div className="space-y-1.5 mb-3">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-semibold text-content-muted uppercase tracking-wider">
            Custom Status Message
          </label>
          <span className="text-[10px] text-content-muted font-mono">
            {statusText.length}/140
          </span>
        </div>
        <div className="relative">
          <input
            type="text"
            maxLength={140}
            value={statusText}
            onChange={(e) => setStatusText(e.target.value)}
            placeholder="What's your focus today?"
            className="w-full text-xs bg-elevated border border-border rounded-lg pl-3 pr-8 py-2 text-content-primary placeholder:text-content-muted focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent"
          />
          {statusText && (
            <button
              onClick={handleClearText}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-content-muted hover:text-content-primary"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Quick Presets */}
      <div className="mb-4">
        <span className="text-[10px] text-content-muted block mb-1.5 font-medium">
          Quick suggestions:
        </span>
        <div className="flex flex-wrap gap-1">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setStatusText(preset)}
              className="text-[10px] px-2 py-0.5 rounded-md bg-elevated hover:bg-floor text-content-secondary hover:text-content-primary border border-border transition-colors"
            >
              {preset}
            </button>
          ))}
        </div>
      </div>

      {/* Save Action Buttons */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        <button
          type="button"
          onClick={onClose}
          className="text-xs px-3 py-1.5 text-content-muted hover:text-content-primary transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={isSaving}
          onClick={handleSave}
          className="text-xs px-3 py-1.5 bg-accent hover:bg-accent-hover text-white font-medium rounded-lg flex items-center gap-1.5 transition-all shadow-xs active:scale-[0.98]"
        >
          <Check className="w-3.5 h-3.5" />
          <span>{isSaving ? 'Saving...' : 'Apply Status'}</span>
        </button>
      </div>
    </div>
  );
};
