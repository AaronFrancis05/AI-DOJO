'use client';

import { useRef, useCallback, useEffect } from 'react';
import { Mic, VolumeX } from 'lucide-react';
import { useVoiceInput } from '@/lib/hooks/useVoiceInput';
import { speak as ttsSpeak, stop as stopTts } from '@/lib/roleplay/tts';
import { getBCP47 } from '@/lib/language';

interface AvatarMicOverlayProps {
  targetLanguage: string;
  nativeLanguage: string;
  onFinalTranscript: (text: string) => void;
  isAiResponding: boolean;
  muted?: boolean;
  onMuteToggle?: () => void;
  partialTranscript?: string;
}

export function AvatarMicOverlay({
  targetLanguage,
  nativeLanguage,
  onFinalTranscript,
  isAiResponding,
  muted = false,
  onMuteToggle,
  partialTranscript: externalPartial,
}: AvatarMicOverlayProps) {
  const bcp47 = getBCP47(targetLanguage, 'stt');

  const voice = useVoiceInput({
    lang: bcp47,
    onFinal: onFinalTranscript,
  });

  const isAiRespondingRef = useRef(isAiResponding);
  isAiRespondingRef.current = isAiResponding;

  // Barge-in: if user starts speaking while AI is responding, stop TTS immediately
  const handleStartListening = useCallback(async () => {
    if (isAiRespondingRef.current) {
      stopTts();
    }
    await voice.start();
  }, [voice]);

  const displayPartial = externalPartial ?? voice.partialTranscript;

  // Auto-stop on AI response start
  useEffect(() => {
    if (isAiResponding && voice.isListening) {
      voice.stop();
    }
  }, [isAiResponding, voice]);

  return (
    <div className="absolute bottom-0 left-0 right-0 z-30 flex flex-col items-center gap-3 pb-8">
      {/* Live caption */}
      {displayPartial && (
        <div className="px-4 py-2 rounded-xl bg-dojo-surface/80 backdrop-blur-md border border-dojo-border border-dashed max-w-md">
          <p className="text-sm text-dojo-text-primary/70 italic">{displayPartial}</p>
        </div>
      )}

      {/* Mic + mute controls */}
      <div className="flex items-center gap-4">
        {onMuteToggle && (
          <button
            onClick={onMuteToggle}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 backdrop-blur-md text-white/70 hover:text-white transition-all"
          >
            <VolumeX className="h-4 w-4" />
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
            onMouseDown={handleStartListening}
            onMouseUp={voice.stop}
            onMouseLeave={voice.stop}
            onTouchStart={(e) => { e.preventDefault(); handleStartListening(); }}
            onTouchEnd={voice.stop}
            className={`relative flex h-16 w-16 items-center justify-center rounded-full transition-all duration-300 ${
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
