import React from 'react';
import { ChatHeader } from './ChatHeader';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';

interface ChatAreaProps {
  onOpenMobileSidebar?: () => void;
}

export const ChatArea: React.FC<ChatAreaProps> = ({ onOpenMobileSidebar }) => {
  return (
    <div className="flex-1 flex flex-col h-full bg-floor relative overflow-hidden">
      <ChatHeader onOpenMobileSidebar={onOpenMobileSidebar} />
      <MessageList />
      <MessageInput />
    </div>
  );
};
