import React from 'react';
import { ChatHeader } from './ChatHeader';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';

export const ChatArea: React.FC = () => {
  return (
    <div className="flex-1 flex flex-col h-full bg-floor relative overflow-hidden">
      <ChatHeader />
      <MessageList />
      <MessageInput />
    </div>
  );
};

