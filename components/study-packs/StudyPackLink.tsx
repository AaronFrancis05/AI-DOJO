'use client';

/* ───────────────────────────────────────────────
   StudyPackLink — the session report's way into
   that session's homework. The pack is written by
   a background job a little after the session
   ends, so this polls until it appears, then
   becomes a link.
   ─────────────────────────────────────────────── */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, NotebookPen } from 'lucide-react';

/** The job usually finishes well inside this; past it, the notification takes over. */
const POLL_INTERVAL_MS = 8_000;
const POLL_ATTEMPTS = 15;

export function StudyPackLink({ sessionId }: { sessionId: number }) {
  const [packId, setPackId] = useState<number | null>(null);
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const check = async () => {
      attempts += 1;
      try {
        const res = await fetch(`/api/study-packs?sessionId=${sessionId}`, { credentials: 'include' });
        const body = await res.json();
        if (cancelled) return;
        if (body?.pack?.id) {
          setPackId(body.pack.id);
          return;
        }
      } catch {
        // Try again on the next tick.
      }
      if (cancelled) return;
      if (attempts >= POLL_ATTEMPTS) setGaveUp(true);
      else timer = setTimeout(check, POLL_INTERVAL_MS);
    };
    void check();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [sessionId]);

  if (packId !== null) {
    return (
      <Link
        href={`/study-packs/${packId}`}
        className="inline-flex items-center gap-2 rounded-[--radius-md] border border-dojo-border bg-dojo-surface px-4 py-2 text-sm font-medium text-dojo-text-primary transition-colors hover:bg-dojo-surface-raised"
      >
        <NotebookPen className="h-4 w-4" /> Open your study pack
      </Link>
    );
  }

  // A session with nothing to work on gets no pack; say nothing rather than spin forever.
  if (gaveUp) return null;

  return (
    <span className="inline-flex items-center gap-2 px-4 py-2 text-sm text-dojo-text-muted">
      <Loader2 className="h-4 w-4 animate-spin" /> Preparing your study pack…
    </span>
  );
}
