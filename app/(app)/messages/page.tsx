'use client';

import { usePageTitle } from '@/lib/hooks/PageTitleContext';
import { MessageSquare } from 'lucide-react';

/**
 * /messages — desktop center pane when no thread is selected.
 * The room list itself lives in layout.tsx (persistent left pane on md+,
 * full-viewport list on mobile), so this route only needs the empty state.
 */
export default function MessagesPage() {
  usePageTitle('Messages');

  return (
    <div className="hidden h-full flex-1 flex-col items-center justify-center gap-3 px-6 text-center md:flex">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-dojo-border bg-dojo-surface text-dojo-text-muted">
        <MessageSquare className="h-7 w-7" />
      </div>
      <p className="text-base font-semibold text-dojo-text-primary">Select a conversation</p>
      <p className="max-w-xs text-sm leading-relaxed text-dojo-text-muted">
        Choose a chat from the list to start messaging. Conversations are
        auto-translated into each person&apos;s language.
      </p>
    </div>
  );
}