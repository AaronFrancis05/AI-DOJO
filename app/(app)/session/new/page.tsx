/* ───────────────────────────────────────────────
   Session Creator — thin redirector
   Resolves domain/situation/character/mode params,
   creates a session via POST /api/sessions,
   then redirects to /session/[sessionId]
   ─────────────────────────────────────────────── */

'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense } from 'react';

function SessionCreator() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const domainSlug = searchParams.get('domain');
    const situationId = searchParams.get('situation');
    const characterId = searchParams.get('character');
    const mode = searchParams.get('mode') ?? 'standard';

    async function createAndRedirect() {
      if (!situationId) {
        router.replace('/hub');
        return;
      }

      try {
        const res = await fetch('/api/sessions', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            situationId: Number(situationId),
            characterId: characterId ? Number(characterId) : undefined,
            behaviorMode: mode,
          }),
        });

        const data = await res.json();
        if (data.success && data.session?.id) {
          router.replace(`/session/${data.session.id}`);
        } else {
          router.replace('/hub?error=session_creation_failed');
        }
      } catch {
        router.replace('/hub?error=session_creation_failed');
      }
    }

    createAndRedirect();
  }, [searchParams, router]);

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
