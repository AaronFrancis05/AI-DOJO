'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { cn } from '@/lib/design-tokens';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { useUser } from '@/lib/auth/user-context';
import { useRealtimeTopics } from '@/lib/realtime/context';
import { topics } from '@/lib/realtime/topics';
import {
  timeAgo,
  langFlag,
  type ChatRoomLite,
  type SearchUser,
} from '@/lib/chat-types';
import { MessageSquare, Search, PenSquare, Users, Loader2, Mic } from 'lucide-react';

interface RoomListPaneProps {
  className?: string;
  /** Denser rows + header used when the pane is a persistent sidebar. */
  compact?: boolean;
}

/**
 * The conversations list: live room rows, an unread badge per row, and a
 * "New chat" dialog backed by /api/users/search. Used as the persistent left
 * pane at md+ and as the full-height mobile list.
 */
export function RoomListPane({ className, compact = false }: RoomListPaneProps) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useUser();

  const [rooms, setRooms] = useState<ChatRoomLite[] | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState<string | null>(null);

  const loadRooms = useCallback(
    () =>
      fetch('/api/chat-rooms', { credentials: 'include' })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.success && Array.isArray(data.rooms)) {
            setRooms(data.rooms as ChatRoomLite[]);
          }
        })
        .catch(() => {
          // transient — the next event or reconciliation retries
        }),
    [],
  );

  // One fetch on mount; after that the list is event-driven. The 8-second
  // poll this replaced ran forever on every open tab, whether or not anyone
  // was talking.
  useEffect(() => {
    void loadRooms();
  }, [loadRooms]);

  // Subscribed per room rather than through a single per-user topic, so a
  // message costs ONE publish however many members the room has. The cap
  // matches the connection's own topic budget; a user with more rooms than
  // that still gets the rest through the provider's reconciliation.
  const roomTopics = useMemo(
    () => (rooms ?? []).slice(0, 16).map((r) => topics.chatRoom(r.id)),
    [rooms],
  );

  useRealtimeTopics(roomTopics.length > 0 ? roomTopics : null, {
    onEvent: () => { void loadRooms(); },
    onSync: () => { void loadRooms(); },
  });

  // Debounced user search (min 2 chars, mirrors the API guard).
  useEffect(() => {
    const q = query.trim();
    const id = setTimeout(async () => {
      if (q.length < 2) {
        setResults([]);
        return;
      }
      setSearching(true);
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`, { credentials: 'include' });
        const data = await res.json();
        if (data.success && Array.isArray(data.users)) setResults(data.users as SearchUser[]);
        else setResults([]);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(id);
  }, [query]);

  async function handleCreate(userId: string) {
    if (creating) return;
    setCreating(userId);
    try {
      const res = await fetch('/api/chat-rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ memberIds: [userId] }),
      });
      const data = await res.json();
      if (data.success) {
        setDialogOpen(false);
        setQuery('');
        setResults([]);
        router.push(`/messages/${data.roomId}`);
      }
    } finally {
      setCreating(null);
    }
  }

  const activeRoomId = pathname.startsWith('/messages/')
    ? Number(pathname.split('/').pop())
    : null;

  return (
    <div className={cn('flex h-full w-full flex-col bg-dojo-sidebar', className)}>
      {/* Pane header */}
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-dojo-border px-4 md:h-16">
        <h1 className={cn('flex-1 font-bold text-dojo-text-primary', compact ? 'text-lg' : 'text-xl')}>
          Messages
        </h1>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          aria-label="New chat"
          className="tap-target flex h-9 w-9 items-center justify-center rounded-full text-dojo-text-muted transition-colors hover:bg-dojo-surface-raised hover:text-dojo-text-primary"
        >
          <PenSquare className="h-5 w-5" />
        </button>
      </div>

      {/* Search / filter (nice-to-have per spec) */}
      {rooms && rooms.length > 0 && (
        <div className="shrink-0 px-3 pb-2 pt-2">
          <div className="flex items-center gap-2 rounded-full border border-dojo-border bg-dojo-surface px-3 py-1.5">
            <Search className="h-4 w-4 shrink-0 text-dojo-text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search chats"
              aria-label="Search conversations"
              className="w-full bg-transparent text-sm text-dojo-text-primary placeholder:text-dojo-text-muted focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* Room rows */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-2 py-2">
        {rooms === null ? (
          <div className="space-y-1.5 px-1 pt-1">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 rounded-[--radius-md] p-2.5">
                <div className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-dojo-border" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-1/2 animate-pulse rounded bg-dojo-border" />
                  <div className="h-3 w-2/3 animate-pulse rounded bg-dojo-border/70" />
                </div>
              </div>
            ))}
          </div>
        ) : rooms.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-dojo-border bg-dojo-surface text-dojo-text-muted">
              <MessageSquare className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium text-dojo-text-primary">No conversations yet</p>
            <p className="text-xs text-dojo-text-muted">
              Start a chat with another learner or your Japanese-speaking contact.
            </p>
            <Button variant="secondary" size="sm" className="mt-1" onClick={() => setDialogOpen(true)}>
              <PenSquare className="h-4 w-4" /> New chat
            </Button>
          </div>
        ) : (
          <ul className="space-y-0.5">
            {rooms.map((room) => (
              <RoomRow
                key={room.id}
                room={room}
                myId={user?.id}
                active={room.id === activeRoomId}
                onClick={() => router.push(`/messages/${room.id}`)}
              />
            ))}
          </ul>
        )}
      </div>

      <NewChatDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        query={query}
        onQueryChange={setQuery}
        results={results}
        searching={searching}
        creating={creating}
        onCreate={handleCreate}
      />
    </div>
  );
}

function RoomRow({
  room,
  myId,
  active,
  onClick,
}: {
  room: ChatRoomLite;
  myId?: string;
  active: boolean;
  onClick: () => void;
}) {
  const isMine = room.lastMessage?.senderId === myId;
  const isVoice = Boolean(room.lastMessage?.audioUrl);
  const preview = isVoice ? 'Voice message' : (room.lastMessage?.body ?? 'No messages yet');
  const unread = room.unreadCount > 0;

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'flex w-full items-center gap-3 rounded-[--radius-md] p-2.5 text-left transition-colors',
          active
            ? 'bg-dojo-accent/10'
            : 'hover:bg-dojo-surface',
        )}
      >
        {room.isGroup ? (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-dojo-border bg-dojo-surface-raised text-dojo-text-muted">
            <Users className="h-5 w-5" />
          </div>
        ) : (
          <Avatar
            name={room.name}
            src={room.members[0]?.avatarSrc}
            size="md"
            className="h-11 w-11"
          />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className={cn('truncate text-sm', unread ? 'font-semibold text-dojo-text-primary' : 'font-medium text-dojo-text-primary')}>
              {room.name}
            </p>
            <span className="shrink-0 text-[11px] text-dojo-text-muted">
              {timeAgo(room.lastMessage?.createdAt ?? room.createdAt)}
            </span>
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-2">
            <p className={cn('truncate text-xs', unread ? 'text-dojo-text-primary' : 'text-dojo-text-muted')}>
              {isMine ? 'You: ' : ''}
              {isVoice && (
                <Mic className="mr-1 inline h-3 w-3 align-[-1px] text-dojo-text-muted" />
              )}
              {preview}
            </p>
            {unread && (
              <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-dojo-accent px-1.5 text-[10px] font-semibold text-white">
                {room.unreadCount}
              </span>
            )}
          </div>
        </div>
      </button>
    </li>
  );
}

function NewChatDialog({
  open,
  onClose,
  query,
  onQueryChange,
  results,
  searching,
  creating,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  query: string;
  onQueryChange: (q: string) => void;
  results: SearchUser[];
  searching: boolean;
  creating: string | null;
  onCreate: (userId: string) => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New chat"
      subtitle="Find someone by name or email to start a conversation."
      size="md"
    >
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dojo-text-muted" />
        <input
          autoFocus
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Type a name or email…"
          aria-label="Search users"
          className="w-full rounded-full border border-dojo-border bg-dojo-surface py-2 pl-9 pr-4 text-sm text-dojo-text-primary placeholder:text-dojo-text-muted focus:border-dojo-accent focus:outline-none focus:ring-2 focus:ring-dojo-accent/20"
        />
      </div>

      <div className="mt-4">
        {searching && (
          <p className="flex items-center gap-2 px-2 text-xs text-dojo-text-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
          </p>
        )}

        {!searching && query.trim().length >= 2 && results.length === 0 && (
          <p className="px-2 text-xs text-dojo-text-muted">No people found.</p>
        )}

        {!searching && query.trim().length < 2 && (
          <p className="px-2 text-xs text-dojo-text-muted">
            Type at least 2 characters to search.
          </p>
        )}

        {results.length > 0 && (
          <ul className="space-y-1">
            {results.map((u) => {
              const lang = langFlag(u.nativeLanguage);
              return (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => onCreate(u.id)}
                    disabled={creating === u.id}
                    className="flex w-full items-center gap-3 rounded-[--radius-md] p-2.5 text-left transition-colors hover:bg-dojo-surface-raised disabled:opacity-60"
                  >
                    <Avatar name={u.name} src={u.avatarSrc} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-dojo-text-primary">{u.name}</p>
                      <p className="flex items-center gap-1 truncate text-xs text-dojo-text-muted">
                        {lang.flag && <span className="text-sm leading-none">{lang.flag}</span>}
                        {u.email}
                      </p>
                    </div>
                    {creating === u.id && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-dojo-text-muted" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Dialog>
  );
}