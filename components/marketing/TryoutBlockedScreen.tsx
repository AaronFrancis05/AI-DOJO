'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Clock, Sparkles } from 'lucide-react';

interface TryoutBlockedScreenProps {
  targetLanguage?: string;
  nativeLanguage?: string;
  /** Milliseconds left on the 24h window; null when the server didn't say. */
  retryAfterMs: number | null;
}

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Shown when a guest has already used their free preview inside the 24-hour
 * window. The countdown is the honest answer to "when can I try again", and
 * the primary action is onboarding rather than the door being shut — signing
 * up doesn't shorten the window, it makes it irrelevant.
 */
export function TryoutBlockedScreen({ targetLanguage, nativeLanguage, retryAfterMs }: TryoutBlockedScreenProps) {
  // Seeded from the prop and then driven by the interval alone — the window
  // is fixed once the screen is on, so re-syncing to the prop on every render
  // would only ever re-announce the same deadline.
  const [remainingMs, setRemainingMs] = useState(retryAfterMs);

  useEffect(() => {
    if (retryAfterMs === null) return;
    const deadline = Date.now() + retryAfterMs;
    const id = setInterval(() => setRemainingMs(Math.max(0, deadline - Date.now())), 1000);
    return () => clearInterval(id);
  }, [retryAfterMs]);

  const onboardingHref = targetLanguage && nativeLanguage
    ? `/onboarding/level?targetLanguage=${targetLanguage}&nativeLanguage=${nativeLanguage}`
    : '/onboarding/level';

  return (
    <div className="flex min-h-dvh items-center justify-center bg-dojo-canvas px-4">
      <div className="w-full max-w-md rounded-2xl border border-dojo-border bg-dojo-surface-raised p-8 text-center shadow-2xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-dojo-warning/15 ring-1 ring-dojo-warning/30">
          <Clock className="h-7 w-7 text-dojo-warning-strong" />
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-dojo-text-primary">
          You&apos;ve used your free preview
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-dojo-text-muted">
          The preview is one session a day. Create a free account and keep practising now —
          full lessons, corrections and progress tracking, with no daily preview limit.
        </p>

        {remainingMs !== null && (
          <div className="mt-6 rounded-xl border border-dojo-border bg-dojo-surface px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-dojo-text-muted">
              Another preview in
            </p>
            <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-dojo-text-primary">
              {formatCountdown(remainingMs)}
            </p>
          </div>
        )}

        <Link
          href={onboardingHref}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-dojo-accent px-6 py-3 font-semibold text-white transition-all hover:bg-dojo-accent/90"
        >
          <Sparkles className="h-4 w-4" />
          Keep learning — set up your plan
        </Link>
        <Link
          href="/auth/signin"
          className="mt-3 block text-xs font-medium text-dojo-text-muted hover:text-dojo-text-primary"
        >
          Already have an account? Log in
        </Link>
      </div>
    </div>
  );
}
