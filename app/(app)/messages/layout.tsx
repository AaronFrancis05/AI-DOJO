'use client';

import { cn } from '@/lib/design-tokens';
import { usePathname } from 'next/navigation';
import { RoomListPane } from '@/components/messages/RoomListPane';

/**
 * Shared layout for the whole /messages section.
 *
 * Mobile: either the room list (/messages) or the thread (/messages/:id)
 * fills the viewport — half of the two-route pages never stack.
 * md+: the room list becomes a persistent left pane and `{children}`
 * renders the active thread (or the "select a conversation" empty state).
 * Switching rooms is pure client navigation, so the pane never remounts.
 */
export default function MessagesLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const inThread = pathname !== '/messages';

  return (
    <div className="flex h-full min-w-0">
      {/* Persistent room list (mobile: only at /messages; md+: always) */}
      <div
        className={cn(
          'h-full w-full border-r border-dojo-border md:w-80 md:shrink-0 md:flex-col',
          inThread ? 'hidden md:flex' : 'flex',
        )}
      >
        <RoomListPane />
      </div>

      {/* Thread (mobile: only at /messages/:id; md+: always) */}
      <div className={cn('h-full min-w-0 flex-1', inThread ? 'flex' : 'hidden md:flex')}>
        {children}
      </div>
    </div>
  );
}