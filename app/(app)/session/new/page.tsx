/* ───────────────────────────────────────────────
   Session Creator — thin redirector
   Resolves domain/situation/character/mode params,
   creates a session via POST /api/sessions,
   then redirects to /session/[sessionId]
   ─────────────────────────────────────────────── */

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense } from 'react';
import { Button } from '@/components/ui/Button';
import { AlertCircleIcon, RefreshCw } from 'lucide-react';

const TIMEOUT_MS = 10_000;

function SessionCreator() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const startedRef = useRef(false);

  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  const attemptCreation = useCallback(async () => {
    startedRef.current = false; // allow retry
    setError(null);
    setTimedOut(false);

    const domainSlug = searchParams.get('domain');
    const situationId = searchParams.get('situation');
    const characterId = searchParams.get('character');
    const mode = searchParams.get('mode') ?? 'standard';

    async function createAndRedirect() {
      if (!situationId) {
        router.replace('/hub');
        return;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
        setTimedOut(true);
        setError('Session creation is taking longer than expected.');
      }, TIMEOUT_MS);

      try {
        const res = await fetch('/api/sessions', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            situationId: Number(situationId),
            characterId: characterId ? Number(characterId) : undefined,
            behaviorMode: mode,
          }),
        });

        clearTimeout(timeoutId);

        const data = await res.json();
        if (data.success && data.session?.id) {
          router.replace(`/session/${data.session.id}`);
        } else {
          setError(data.error || 'Session creation failed. Please try again.');
        }
      } catch (e: any) {
        clearTimeout(timeoutId);
        if (e?.name === 'AbortError') {
          // timeout already handled
          return;
        }
        setError('Network error. Please try again.');
      }
    }

    await createAndRedirect();
  }, [searchParams, router]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    attemptCreation();
  }, [attemptCreation]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center max-w-sm">
          <AlertCircleIcon className="h-10 w-10 text-dojo-danger mx-auto mb-3" />
          <p className="text-dojo-text-primary font-semibold mb-1">
            {timedOut ? 'Still preparing...' : 'Something went wrong'}
          </p>
          <p className="text-sm text-dojo-text-muted mb-4">{error}</p>
          <Button variant="primary" onClick={attemptCreation}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <div className="animate-pulse text-dojo-text-muted mb-2">Preparing your roleplay...</div>
        <div className="flex justify-center gap-1">
          <span className="h-2 w-2 rounded-full bg-dojo-accent animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="h-2 w-2 rounded-full bg-dojo-accent animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="h-2 w-2 rounded-full bg-dojo-accent animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}

export default function SessionNewPage() {
  return (
    <Suspense fallback={
      <div className="flex h-full items-center justify-center">
        <div className="animate-pulse text-dojo-text-muted">Loading...</div>
      </div>
    }>
      <SessionCreator />
    </Suspense>
  );
}
