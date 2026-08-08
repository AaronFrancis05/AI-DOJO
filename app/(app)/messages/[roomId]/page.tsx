'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChatHeader } from '@/components/messages/ChatHeader';
import { MessageBubble } from '@/components/messages/MessageBubble';
import { MessageComposer } from '@/components/messages/MessageComposer';
import { RoomDetailsPanel } from '@/components/messages/RoomDetailsPanel';
import { usePageTitle } from '@/lib/hooks/PageTitleContext';
import { useUser } from '@/lib/auth/user-context';
import { langFlag, type ChatRoomDetail, type ChatMessage } from '@/lib/chat-types';
import { MessageSquare } from 'lucide-react';

export default function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const router = useRouter();
  const user = useUser();
  const [roomId, setRoomId] = useState<number | null>(null);

  const [room, setRoom] = useState<ChatRoomDetail | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const lastSeenIdRef = useRef<number>(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedAtBottomRef = useRef(true);

  // Resolve the awaited roomId param once.
  useEffect(() => {
    let cancelled = false;
    params.then(({ roomId: raw }) => {
      if (cancelled) return;
      setRoomId(Number(raw));
    });
    return () => { cancelled = true; };
  }, [params]);

  const markRead = useCallback(async () => {
    if (roomId == null || Number.isNaN(roomId)) return;
    try {
      await fetch(`/api/chat-rooms/${roomId}/read`, { method: 'POST', credentials: 'include' });
    } catch {
      // fire-and-forget; errors are swallowed per spec
    }
  }, [roomId]);

  // Fetch room detail + initial messages on mount (parallel).
  useEffect(() => {
    if (roomId === null || Number.isNaN(roomId)) return;
    let cancelled = false;

    async function bootstrap() {
      const [detailRes, msgsRes] = await Promise.all([
        fetch(`/api/chat-rooms/${roomId}`, { credentials: 'include' }),
        fetch(`/api/chat-rooms/${roomId}/messages`, { credentials: 'include' }),
      ]);

      if (cancelled) return;

      if (!detailRes.ok) {
        // 403/404 → not a member / missing room
        router.replace('/messages');
        return;
      }

      const detail = await detailRes.json();
      const msgs = await msgsRes.json();
      if (cancelled) return;

      if (detail.success) setRoom(detail.room as ChatRoomDetail);
      if (msgs.success && Array.isArray(msgs.messages)) {
        const list = msgs.messages as ChatMessage[];
        setMessages(list);
        lastSeenIdRef.current = list.length ? list[list.length - 1].id : 0;
      }
      setLoading(false);
      pinnedAtBottomRef.current = true;
      markRead();
    }

    bootstrap();
    return () => { cancelled = true; };
  }, [roomId, markRead, router]);

  // Poll for new messages every 3s.
  useEffect(() => {
    if (roomId === null || Number.isNaN(roomId)) return;

    async function poll() {
      try {
        const res = await fetch(
          `/api/chat-rooms/${roomId}/messages?after=${lastSeenIdRef.current}`,
          { credentials: 'include' },
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!data.success || !Array.isArray(data.messages)) return;

        const fresh = data.messages as ChatMessage[];
        if (fresh.length === 0) return;

        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          const merged = [...prev];
          for (const m of fresh) {
            if (!seen.has(m.id)) merged.push(m);
          }
          const sorted = merged.sort((a, b) => a.id - b.id);
          lastSeenIdRef.current = sorted.length ? sorted[sorted.length - 1].id : 0;
          return sorted;
        });
        markRead();
      } catch {
        // transient — next poll retries
      }
    }

    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [roomId, markRead]);

  // Auto-scroll to the newest message when pinned at the bottom.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !pinnedAtBottomRef.current) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Within 80px of the bottom counts as "pinned".
    pinnedAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  async function handleSend(text: string) {
    if (roomId === null || Number.isNaN(roomId) || !text.trim() || !user) return;
    try {
      const res = await fetch(`/api/chat-rooms/${roomId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ text }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (!data.success) return;

      // Optimistically append — the sender always reads their own original text.
      const optimistic: ChatMessage = {
        id: data.message?.id ?? Date.now(),
        senderId: user.id,
        senderName: user.name,
        senderAvatarSrc: user.avatarSrc ?? null,
        body: text,
        sourceLanguage: null,
        translatedBody: text,
        translationProvider: 'none',
        isMine: true,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => {
        const dedupe = (arr: ChatMessage[]) => {
          const seen = new Set<number>(prev.map((m) => m.id));
          return arr.filter((m) => !seen.has(m.id));
        };
        const next = [...prev, optimistic];
        const deduped = dedupe(next);
        lastSeenIdRef.current = deduped.length ? Math.max(deduped[deduped.length - 1].id, optimistic.id) : optimistic.id;
        return deduped;
      });
      pinnedAtBottomRef.current = true;
      markRead();
    } catch {
      // keep the optimistic message; the next poll reconciles ids
    }
  }

  usePageTitle(room?.name ?? 'Messages');

  const isGroup = room?.isGroup ?? false;
  const otherMember = !isGroup && room ? room.members[0] : null;
  const lang = otherMember ? langFlag(otherMember.language) : null;
  const subtitle = isGroup
    ? room ? `${room.members.length} members` : undefined
    : otherMember
      ? `Writes in ${lang?.flag ?? ''} ${otherMember.language.toUpperCase()}`.trim()
      : undefined;

  return (
    <div className="flex h-full min-w-0 flex-1">
      <div className="flex h-full min-w-0 flex-1 flex-col bg-dojo-canvas">
        {/* Header */}
        <ChatHeader
          name={room?.name ?? 'Chat'}
          subtitle={subtitle}
          avatarSrc={room?.members[0]?.avatarSrc ?? null}
          avatarName={room?.members[0]?.name ?? 'Chat'}
          isGroup={isGroup}
          onBack={() => router.push('/messages')}
        />

        {/* Messages */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 py-4 md:px-6"
        >
          {loading ? (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-dojo-text-muted">
              <MessageSquare className="h-4 w-4 animate-pulse" />
              Loading conversation…
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
              <p className="text-sm font-medium text-dojo-text-primary">Say hello 👋</p>
              <p className="text-xs text-dojo-text-muted">
                This conversation is empty. Messages are auto-translated into each
                person&apos;s language.
              </p>
            </div>
          ) : (
            messages.map((m) => (
              <MessageBubble key={m.id} message={m} showSender={isGroup} />
            ))
          )}
        </div>

        {/* Composer */}
        <div className="shrink-0 border-t border-dojo-border bg-dojo-sidebar">
          <MessageComposer disabled={loading} onSend={handleSend} />
        </div>
      </div>

      {/* Details pane (Reference 3 right column) — xl+ */}
      <RoomDetailsPanel room={room} myId={user?.id} className="hidden xl:flex" />
    </div>
  );
}