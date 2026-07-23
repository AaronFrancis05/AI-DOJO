/* ───────────────────────────────────────────────
   Session Creator — thin redirector
   Resolves domain/situation/character/mode params,
   prompts for language selection, creates a session,
   then redirects to /session/[sessionId]
   ─────────────────────────────────────────────── */

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense } from 'react';
import { Button } from '@/components/ui/Button';
import { LanguagePicker } from '@/components/ui/LanguagePicker';
import { GenderPicker } from '@/components/ui/GenderPicker';
import { AlertCircleIcon, RefreshCw } from 'lucide-react';

const TIMEOUT_MS = 10_000;

function SessionCreator() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const startedRef = useRef(false);

  const [targetLanguage, setTargetLanguage] = useState('ja');
  const [nativeLanguage, setNativeLanguage] = useState('en');
  const [voiceGender, setVoiceGender] = useState<'female' | 'male'>('female');
  const [showPicker, setShowPicker] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    async function loadPrefs() {
      try {
        const res = await fetch('/api/user/stats');
        const data = await res.json();
        if (data.success && data.stats) {
          if (data.stats.preferredTargetLanguage) setTargetLanguage(data.stats.preferredTargetLanguage);
          if (data.stats.nativeLanguage) setNativeLanguage(data.stats.nativeLanguage);
        }
      } catch {}
    }
    const targetParam = searchParams.get('targetLang');
    const nativeParam = searchParams.get('nativeLang');
    if (targetParam) setTargetLanguage(targetParam);
    if (nativeParam) setNativeLanguage(nativeParam);
    loadPrefs();
    fetch('/api/user/preferences')
      .then(r => r.json())
      .then(d => { if (d.voiceGender) setVoiceGender(d.voiceGender); })
      .catch(() => {});
  }, [searchParams]);

  const attemptCreation = useCallback(async () => {
    startedRef.current = false;
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
            targetLanguage,
            nativeLanguage,
            voiceGender,
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
          return;
        }
        setError('Network error. Please try again.');
      }
    }

    await createAndRedirect();
  }, [searchParams, router, targetLanguage, nativeLanguage, voiceGender]);

  if (showPicker) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <h1 className="text-xl font-bold text-dojo-text-primary mb-1">Prepare Your Roleplay</h1>
            <p className="text-sm text-dojo-text-muted">Set your language preferences before starting.</p>
          </div>
          <div className="rounded-[--radius-lg] border border-dojo-border bg-dojo-surface p-5 space-y-5">
            <LanguagePicker
              targetLanguage={targetLanguage}
              nativeLanguage={nativeLanguage}
              onTargetChange={setTargetLanguage}
              onNativeChange={setNativeLanguage}
            />
            <div className="border-t border-dojo-border pt-4">
              <p className="text-xs font-medium text-dojo-text-muted mb-2">AI Voice</p>
              <GenderPicker value={voiceGender} onChange={setVoiceGender} />
            </div>
          </div>
          <Button
            variant="primary"
            className="w-full"
            onClick={() => { setShowPicker(false); startedRef.current = false; attemptCreation(); }}
          >
            Start Roleplay
          </Button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center max-w-sm">
          <AlertCircleIcon className="h-10 w-10 text-dojo-danger mx-auto mb-3" />
          <p className="text-dojo-text-primary font-semibold mb-1">
            {timedOut ? 'Still preparing...' : 'Something went wrong'}
          </p>
          <p className="text-sm text-dojo-text-muted mb-4">{error}</p>
          <Button variant="primary" onClick={() => { setShowPicker(true); }}>
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
