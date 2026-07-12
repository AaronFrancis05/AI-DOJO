/* ───────────────────────────────────────────────
   Messages (Panel 11)
   Thread list + message view (simplified)
   ─────────────────────────────────────────────── */

'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { messageThreads } from '@/lib/data/sessions';
import { ArrowLeft, Send } from 'lucide-react';

export default function MessagesPage() {
  const [selectedThread, setSelectedThread] = useState<number | null>(null);

  const activeThread = messageThreads.find((t) => t.id === selectedThread);

  return (
    <div className="flex h-full">
      {/* Thread List */}
      <div className="w-80 shrink-0 border-r border-dojo-border overflow-y-auto">
        <div className="p-4 border-b border-dojo-border">
          <h1 className="text-lg font-bold text-dojo-text-primary">Messages</h1>
        </div>
        <div className="divide-y divide-dojo-border">
          {messageThreads.map((thread) => (
            <button
              key={thread.id}
              onClick={() => setSelectedThread(thread.id)}
              className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-dojo-surface ${
                selectedThread === thread.id ? 'bg-dojo-surface' : ''
              }`}
            >
              <div className="relative">
                <Avatar name={thread.otherUserName} color={thread.otherUserAvatar} size="md" />
                {thread.unread && (
                  <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-dojo-danger ring-2 ring-dojo-canvas" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-dojo-text-primary truncate">
                  {thread.otherUserName}
                </p>
                <p className="text-xs text-dojo-text-muted truncate mt-0.5">
                  {thread.lastMessage}
                </p>
              </div>
              <div className="text-[10px] text-dojo-text-muted shrink-0">
                {new Date(thread.lastMessageTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Message View */}
      <div className="flex-1 flex flex-col">
        {activeThread ? (
          <>
            <div className="flex items-center gap-3 border-b border-dojo-border px-4 py-3">
              <Button variant="ghost" size="sm" className="lg:hidden" onClick={() => setSelectedThread(null)}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <Avatar name={activeThread.otherUserName} color={activeThread.otherUserAvatar} size="sm" />
              <p className="text-sm font-semibold text-dojo-text-primary">{activeThread.otherUserName}</p>
            </div>
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm text-dojo-text-muted">
                Message view — full implementation coming soon.
              </p>
            </div>
            <div className="border-t border-dojo-border p-4">
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  placeholder="Type a message..."
                  className="flex-1 rounded-[--radius-md] bg-dojo-surface border border-dojo-border px-4 py-2.5 text-sm text-dojo-text-primary placeholder:text-dojo-text-muted outline-none focus:border-dojo-accent transition-colors"
                />
                <Button variant="primary" size="md">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <p className="text-dojo-text-muted">Select a conversation</p>
              <p className="text-xs text-dojo-text-muted mt-1">Choose a thread from the left to view messages</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
