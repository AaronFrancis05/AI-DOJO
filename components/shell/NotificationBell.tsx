/* ───────────────────────────────────────────────
   NotificationBell — unread badge + dropdown, in the sidebar.

   Live rather than polled: subscribes to the signed-in user's own realtime
   topic, so a tutor submitting a grade lights the learner's bell in the same
   second. The provider's reconciliation is the safety net (see
   lib/realtime/context.tsx) — nothing here polls on its own.
   ─────────────────────────────────────────────── */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/design-tokens';
import { useUser } from '@/lib/auth/user-context';
import { useRealtimeTopics } from '@/lib/realtime/context';
import { topics } from '@/lib/realtime/topics';
import { timeAgo } from '@/lib/chat-types';
import { Bell, Check } from 'lucide-react';

interface NotificationRow {
  id: number;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

export function NotificationBell({ onNavigate }: { onNavigate?: () => void }) {
  const user = useUser();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(
    () =>
      fetch('/api/notifications', { credentials: 'include' })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!data?.success) return;
          setRows(data.notifications as NotificationRow[]);
          setUnread(Number(data.unreadCount) || 0);
        })
        .catch(() => {
          // transient — the next event or reconciliation retries
        }),
    [],
  );

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  const userTopics = useMemo(() => (user ? [topics.user(user.id)] : null), [user]);

  useRealtimeTopics(userTopics, {
    onEvent: (event) => {
      if (event.type !== 'notification') return;
      void load();
    },
    onSync: load,
  });

  // Click-outside and Escape close the panel — the same affordances Dialog
  // gives, without a modal for a list this small.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const markAllRead = useCallback(async () => {
    // Optimistic: the badge is the whole point of the control, so it must
    // clear on the click rather than after a round trip.
    setUnread(0);
    setRows((prev) => prev.map((r) => ({ ...r, readAt: r.readAt ?? new Date().toISOString() })));
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
    } catch {
      void load();
    }
  }, [load]);

  const markOneRead = useCallback(async (id: number) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, readAt: new Date().toISOString() } : r)));
    setUnread((n) => Math.max(0, n - 1));
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids: [id] }),
      });
    } catch {
      void load();
    }
  }, [load]);

  if (!user) return null;

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        className={cn(
          'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
          open
            ? 'bg-dojo-surface text-dojo-text-primary'
            : 'text-dojo-text-muted hover:bg-dojo-surface hover:text-dojo-text-primary',
        )}
      >
        <span className="relative shrink-0">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-dojo-accent px-1 text-[10px] font-bold leading-none text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </span>
        Notifications
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-72 overflow-hidden rounded-(--radius-md) border border-dojo-border bg-dojo-surface-raised shadow-2xl">
          <div className="flex items-center justify-between border-b border-dojo-border px-4 py-3">
            <span className="text-xs font-bold uppercase tracking-widest text-dojo-text-muted">
              Notifications
            </span>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="inline-flex items-center gap-1 text-xs text-dojo-text-muted transition-colors hover:text-dojo-text-primary"
              >
                <Check className="h-3 w-3" /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {rows.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-dojo-text-muted">
                Nothing yet.
              </p>
            ) : (
              rows.map((n) => {
                const content = (
                  <>
                    <span className="flex items-start gap-2">
                      {!n.readAt && (
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-dojo-accent" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium leading-snug text-dojo-text-primary">
                          {n.title}
                        </span>
                        {n.body && (
                          <span className="mt-0.5 block text-xs leading-relaxed text-dojo-text-muted">
                            {n.body}
                          </span>
                        )}
                        <span className="mt-1 block text-[11px] text-dojo-text-muted">
                          {timeAgo(n.createdAt)}
                        </span>
                      </span>
                    </span>
                  </>
                );

                const className = cn(
                  'block w-full border-b border-dojo-border px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-dojo-surface',
                  !n.readAt && 'bg-dojo-accent-soft/40',
                );

                return n.href ? (
                  <Link
                    key={n.id}
                    href={n.href}
                    className={className}
                    onClick={() => {
                      void markOneRead(n.id);
                      setOpen(false);
                      onNavigate?.();
                    }}
                  >
                    {content}
                  </Link>
                ) : (
                  <button
                    key={n.id}
                    type="button"
                    className={className}
                    onClick={() => { void markOneRead(n.id); }}
                  >
                    {content}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
