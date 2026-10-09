/* ───────────────────────────────────────────────
   LiveCaptions — the tutor's speech as on-screen captions in a 1:1 lesson
   (PLAN.md 4.8 part 4), for a learner who may share no language with them.

   Runs in the learner's browser on the tutor's incoming audio track, with the
   same Azure Speech SDK and token route the roleplay uses. 'translated' shows
   the tutor's English in the learner's language; 'transcript' shows the
   English itself. The audio is never altered — captions only render here.

   Must render inside the Stream call (CallStage's `tools`), because the
   tutor's MediaStream comes from the call state. Caption time is reported to
   the server every minute for the ai_usage ledger and the daily cap.
   ─────────────────────────────────────────────── */

'use client';

import { useEffect, useRef, useState } from 'react';
import * as SpeechSDK from 'microsoft-cognitiveservices-speech-sdk';
import { useCallStateHooks } from '@stream-io/video-react-sdk';
import { getToken } from '@/lib/roleplay/pronunciation';
import { CAPTION_REPORT_INTERVAL_SECONDS, type CaptionMode } from '@/lib/tutors/captions';
import { cn } from '@/lib/design-tokens';
import { Captions } from 'lucide-react';

interface CaptionSettings {
  defaultMode: CaptionMode;
  speechLanguage: string;
  translateTo: string;
  remainingSeconds: number;
}

const MODE_LABELS: Record<CaptionMode, string> = {
  translated: 'Translated',
  transcript: 'English',
  off: 'Off',
};

const MAX_LINES = 3;

export function LiveCaptions({
  bookingId,
  onLine,
}: {
  bookingId: number;
  /** Each finished caption line, in the language it was shown in — feeds "Explain in my language". */
  onLine?: (line: { original: string; shown: string }) => void;
}) {
  const { useRemoteParticipants } = useCallStateHooks();
  const remote = useRemoteParticipants();
  // A 1:1 booking: the only other participant is the tutor.
  const tutorStream = remote[0]?.audioStream ?? null;

  const [settings, setSettings] = useState<CaptionSettings | null>(null);
  const [mode, setMode] = useState<CaptionMode>('off');
  const [lines, setLines] = useState<string[]>([]);
  const [partial, setPartial] = useState('');
  const [error, setError] = useState('');
  const [remaining, setRemaining] = useState<number | null>(null);

  const onLineRef = useRef(onLine);
  useEffect(() => { onLineRef.current = onLine; });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/bookings/${bookingId}/captions`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (cancelled || !body?.success) return;
        setSettings(body as CaptionSettings);
        setMode(body.defaultMode);
        setRemaining(body.remainingSeconds);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [bookingId]);

  const outOfTime = remaining !== null && remaining <= 0;
  const active = settings != null && mode !== 'off' && tutorStream != null && !outOfTime;

  useEffect(() => {
    if (!active || !settings || !tutorStream) return;
    let recognizer: SpeechSDK.Recognizer | null = null;
    let stopped = false;
    let since = Date.now();

    const report = (seconds: number) =>
      fetch(`/api/bookings/${bookingId}/captions`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ seconds }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((body) => { if (body?.success) setRemaining(body.remainingSeconds); })
        .catch(() => {});

    const timer = window.setInterval(() => {
      since = Date.now();
      void report(CAPTION_REPORT_INTERVAL_SECONDS);
    }, CAPTION_REPORT_INTERVAL_SECONDS * 1000);

    const push = (original: string, shown: string) => {
      if (!shown) return;
      setPartial('');
      setLines((prev) => [...prev, shown].slice(-MAX_LINES));
      onLineRef.current?.({ original, shown });
    };

    void (async () => {
      try {
        const { token, region } = await getToken();
        if (stopped) return;
        const audio = SpeechSDK.AudioConfig.fromStreamInput(tutorStream);

        if (mode === 'translated') {
          const config = SpeechSDK.SpeechTranslationConfig.fromAuthorizationToken(token, region);
          config.speechRecognitionLanguage = settings.speechLanguage;
          config.addTargetLanguage(settings.translateTo);
          const reco = new SpeechSDK.TranslationRecognizer(config, audio);
          reco.recognizing = (_s, e) => setPartial(e.result.translations.get(settings.translateTo) ?? '');
          reco.recognized = (_s, e) => push(e.result.text, e.result.translations.get(settings.translateTo) ?? '');
          reco.canceled = (_s, e) => { if (e.errorDetails) setError('Captions stopped: ' + e.errorDetails); };
          recognizer = reco;
          reco.startContinuousRecognitionAsync();
        } else {
          const config = SpeechSDK.SpeechConfig.fromAuthorizationToken(token, region);
          config.speechRecognitionLanguage = settings.speechLanguage;
          const reco = new SpeechSDK.SpeechRecognizer(config, audio);
          reco.recognizing = (_s, e) => setPartial(e.result.text);
          reco.recognized = (_s, e) => push(e.result.text, e.result.text);
          reco.canceled = (_s, e) => { if (e.errorDetails) setError('Captions stopped: ' + e.errorDetails); };
          recognizer = reco;
          reco.startContinuousRecognitionAsync();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Captions could not start.');
      }
    })();

    return () => {
      stopped = true;
      window.clearInterval(timer);
      const tail = Math.round((Date.now() - since) / 1000);
      if (tail > 0) void report(tail);
      const r = recognizer;
      if (r && 'stopContinuousRecognitionAsync' in r) {
        (r as SpeechSDK.SpeechRecognizer).stopContinuousRecognitionAsync(() => r.close(), () => r.close());
      } else {
        r?.close();
      }
      setPartial('');
    };
  }, [active, bookingId, mode, settings, tutorStream]);

  if (!settings) return null;

  return (
    <div className="space-y-2 text-white">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Captions className="h-4 w-4 shrink-0" aria-hidden />
        <span>Captions</span>
        {(['translated', 'transcript', 'off'] as CaptionMode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => { setError(''); setMode(m); }}
            className={cn(
              'rounded-full border px-2 py-1 transition-colors',
              mode === m ? 'border-white bg-white text-black' : 'border-white/30 hover:border-white',
            )}
          >
            {MODE_LABELS[m]}
          </button>
        ))}
        {outOfTime && <span>Today&apos;s caption time is used up.</span>}
      </div>
      {mode !== 'off' && (
        <div className="min-h-12 rounded-(--radius-md) bg-black/60 px-4 py-2 text-base leading-relaxed" aria-live="polite">
          {lines.map((line, i) => <p key={`${i}-${line}`}>{line}</p>)}
          {partial && <p className="italic">{partial}</p>}
          {!tutorStream && <p className="text-sm italic">Waiting for your tutor&apos;s audio…</p>}
        </div>
      )}
      {error && <p className="text-xs">{error}</p>}
    </div>
  );
}
