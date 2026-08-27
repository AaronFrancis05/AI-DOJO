'use client';

import { useEffect } from 'react';
import { Mic, Volume2, VolumeX } from 'lucide-react';
import { usePushToTalk } from '@/lib/hooks/usePushToTalk';
import { getBCP47 } from '@/lib/language';

interface AvatarMicOverlayProps {
  targetLanguage: string;
  onFinalTranscript: (text: string) => void;
  isAiResponding: boolean;
  muted?: boolean;
  onMuteToggle?: () => void;
}

export function AvatarMicOverlay({
  targetLanguage,
  onFinalTranscript,
  isAiResponding,
  muted = false,
  onMuteToggle,
}: AvatarMicOverlayProps) {
  const bcp47 = getBCP47(targetLanguage, 'stt');

  const voice = usePushToTalk({
    lang: bcp47,
    onFinal: onFinalTranscript,
  });

  // Auto-stop when the AI starts replying, so a mic left open doesn't record
  // the character's own voice.
  //
  // Gated on isHeld rather than on a barge-in flag. The flag only covered a
  // press that landed while isAiResponding was ALREADY true; a press landing
  // in the beat before it flips — which is most of them, since submitting the
  // turn is what flips it — was closed by this effect mid-utterance and the
  // fragment transmitted. A button the learner is physically holding is never
  // something to close on the app's own initiative.
  const { isListening, isHeld, stop } = voice;
  useEffect(() => {
    if (isAiResponding && isListening && !isHeld) void stop();
  }, [isAiResponding, isListening, isHeld, stop]);

  return (
    <div className="absolute bottom-0 left-0 right-0 z-30 flex flex-col items-center gap-3 pb-8 safe-bottom">
      {voice.partialTranscript && (
        <div className="px-4 py-2 rounded-xl bg-dojo-surface/80 backdrop-blur-md border border-dojo-border border-dashed max-w-md">
          <p className="text-sm text-dojo-text-primary/70 italic">{voice.partialTranscript}</p>
        </div>
      )}

      <div className="flex items-center gap-4">
        {onMuteToggle && (
          <button
            type="button"
            onClick={onMuteToggle}
            aria-label={muted ? 'Unmute' : 'Mute'}
            className="tap-target flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 backdrop-blur-md text-white/70 hover:text-white transition-all"
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
        )}

        <div className="relative">
          {voice.isListening && (
            <>
              <span className="absolute inset-0 rounded-full bg-dojo-warning/30 animate-ping" />
              <span className="absolute inset-0 rounded-full bg-dojo-warning/20 animate-pulse" />
            </>
          )}
          <button
            type="button"
            {...voice.buttonProps}
            aria-label={voice.isListening ? 'Stop recording' : 'Start recording'}
            aria-pressed={voice.isListening}
            className={`relative flex h-16 w-16 items-center justify-center rounded-full transition-all duration-300 select-none ${
              voice.isListening
                ? 'bg-dojo-warning scale-110 shadow-[0_0_30px_rgba(242,169,59,0.6)] ring-4 ring-dojo-warning/20'
                : 'bg-dojo-accent hover:scale-105 shadow-[0_10px_25px_rgba(45,59,197,0.5)]'
            }`}
          >
            <Mic className="h-7 w-7 text-white" />
          </button>
        </div>
      </div>

      {voice.error && (
        <p className="text-xs text-dojo-danger bg-dojo-surface/80 px-3 py-1 rounded-lg">{voice.error}</p>
      )}
    </div>
  );
}
