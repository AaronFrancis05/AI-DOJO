/* ───────────────────────────────────────────────
   RoomChatPanel — the text chat sidebar inside a live room.

   Backed by the project's own `chat_rooms` tables, NOT GetStream Chat. That
   is a cost decision made once and enforced here: Stream Video is metered
   per participant-minute, Stream Chat is a separate contract with a large
   monthly floor, and this product already has a messaging stack that does
   something Stream Chat does not — every message is translated per reader by
   UgaJapa, so a Ugandan learner and a Japanese tutor each read the room in
   their own language.

   Live, not polled: the same realtime provider the /messages surface uses.
   ─────────────────────────────────────────────── */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageBubble } from '@/components/messages/MessageBubble';
import { MessageComposer, type VoiceClip } from '@/components/messages/MessageComposer';
import { useUser } from '@/lib/auth/user-context';
import { useRealtimeTopics } from '@/lib/realtime/context';
import { topics } from '@/lib/realtime/topics';
import { cn } from '@/lib/design-tokens';
import type { ChatMessage } from '@/lib/chat-types';
import { MessageSquare, Languages } from 'lucide-react';

interface RoomChatPanelProps {
  /** The `chat_rooms` row this call is wired to; null hides the panel. */
  roomId: number | null;
  /** True when the deployment has an UgaJapa key — drives the header note. */
  translationConfigured?: boolean;
  className?: string;
}

export function RoomChatPanel({
  roomId,
  translationConfigured = true,
  className,
}: RoomChatPanelProps) {
  const user = useUser();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [voiceSending, setVoiceSending] = useState(false);
  const lastSeenIdRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  /**
   * Pulls everything after the newest message on screen.
   *
   * The only path new messages arrive by. A realtime event says only that
   * the room changed — the text still has to come through this route,
   * because that is where it is translated for *this* reader.
   */
  const sync = useCallback(
    () =>
      roomId == null
        ? Promise.resolve()
        : fetch(`/api/chat-rooms/${roomId}/messages?after=${lastSeenIdRef.current}`, {
            credentials: 'include',
          })
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
              setLoading(false);
              if (!data?.success || !Array.isArray(data.messages)) return;
              const fresh = data.messages as ChatMessage[];
              if (fresh.length === 0) return;

              setMessages((prev) => {
                const seen = new Set(prev.map((m) => m.id));
                const merged = [...prev, ...fresh.filter((m) => !seen.has(m.id))];
                merged.sort((a, b) => a.id - b.id);
                lastSeenIdRef.current = merged.length ? merged[merged.length - 1].id : 0;
                return merged;
              });
            })
            .catch(() => {
              // transient — the next event or reconciliation retries
              setLoading(false);
            }),
    [roomId],
  );

  // One fetch on mount. There is deliberately no "the room changed" reset:
  // the panel is keyed on its roomId by every caller (see the `key` on the
  // RoomChatPanel usages), so a different room is a different component
  // instance rather than the same one holding another room's transcript.
  useEffect(() => {
    void sync();
  }, [sync]);

  useRealtimeTopics(roomId != null ? [topics.chatRoom(roomId)] : null, {
    onEvent: (event) => {
      if (event.type !== 'chat.message') return;
      if (event.messageId <= lastSeenIdRef.current) return;
      void sync();
    },
    onSync: sync,
  });

  // The panel is short and always reads bottom-up; unlike /messages there is
  // no scrollback to preserve, so it always sticks to the newest line.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const send = useCallback(
    async (text: string) => {
      if (roomId == null || !text.trim() || !user) return;
      try {
        const res = await fetch(`/api/chat-rooms/${roomId}/messages`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!data.success) return;

        // The sender always reads their own original text, never a
        // round-trip translation of it.
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
        setMessages((prev) =>
          prev.some((m) => m.id === optimistic.id) ? prev : [...prev, optimistic],
        );
        lastSeenIdRef.current = Math.max(lastSeenIdRef.current, optimistic.id);
      } catch {
        // keep the optimistic message; the next sync reconciles ids
      }
    },
    [roomId, user],
  );

  const sendVoice = useCallback(
    async (clip: VoiceClip) => {
      if (roomId == null || voiceSending) return;
      setVoiceSending(true);
      try {
        const form = new FormData();
        const ext = clip.mimeType.includes('mp4') ? 'm4a' : clip.mimeType.includes('ogg') ? 'ogg' : 'webm';
        form.append('audio', clip.blob, `voice.${ext}`);
        form.append('durationMs', String(clip.durationMs));
        form.append('text', '');
        await fetch(`/api/chat-rooms/${roomId}/messages`, {
          method: 'POST',
          credentials: 'include',
          body: form,
        });
        // No optimistic bubble here: unlike /messages, the panel is next to a
        // live video call where the clip has already been spoken aloud, and
        // the server's transcript is the useful version.
        await sync();
      } catch {
        // the next sync picks it up if it landed
      } finally {
        setVoiceSending(false);
      }
    },
    [roomId, voiceSending, sync],
  );

  if (roomId == null) return null;

  return (
    <aside
      className={cn(
        'flex min-h-0 w-full flex-col rounded-(--radius-md) border border-dojo-border bg-dojo-surface',
        className,
      )}
    >
      <header className="shrink-0 border-b border-dojo-border px-4 py-3">
        <h2 className="text-xs font-bold uppercase tracking-widest text-dojo-text-muted">
          Room chat
        </h2>
        {translationConfigured && (
          <p className="mt-1 flex items-center gap-1.5 text-[11px] leading-relaxed text-dojo-text-muted">
            <Languages className="h-3 w-3 shrink-0" />
            Everyone reads this in their own language.
          </p>
        )}
      </header>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 py-4">
        {loading ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-dojo-text-muted">
            <MessageSquare className="h-4 w-4 animate-pulse" />
            Loading…
          </div>
        ) : messages.length === 0 ? (
          <p className="px-2 text-xs leading-relaxed text-dojo-text-muted">
            No messages yet. Anything typed here is translated for each person in the room.
          </p>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} message={m} showSender />)
        )}
      </div>

      <div className="shrink-0 border-t border-dojo-border">
        <MessageComposer
          disabled={loading}
          onSend={send}
          onSendVoice={sendVoice}
          voiceSending={voiceSending}
        />
      </div>
    </aside>
  );
}
