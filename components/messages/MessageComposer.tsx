'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/design-tokens';
import { Send, Mic, Square, PlayCircle, Loader2, X } from 'lucide-react';

/** Voice clip captured by the recorder, ready to be sent. */
export interface VoiceClip {
  blob: Blob;
  mimeType: string;
  durationMs: number;
}

interface MessageComposerProps {
  disabled?: boolean;
  onSend: (text: string) => void;
  /** Sends a recorded voice clip. The clip blob is still owned by the caller. */
  onSendVoice?: (clip: VoiceClip) => void;
  /** True while a voice message is being uploaded/transcribed by the room page. */
  voiceSending?: boolean;
}

function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return 'audio/webm';
  for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m;
  }
  return 'audio/webm';
}

/**
 * Pill-shaped composer. Enter sends, Shift+Enter inserts a newline. The mic tulip
 * button records a voice clip (MediaRecorder), previews it with playback, and sends
 * it as an audio message. Matches the reference app's pill treatment (Reference 1).
 */
export function MessageComposer({ disabled, onSend, onSendVoice, voiceSending = false }: MessageComposerProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [clip, setClip] = useState<VoiceClip | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  const hasCapability = typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined';

  const canSend = value.trim().length > 0 && !disabled && !recording;

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startTimeRef.current);
    }, 250);
  }, [stopTimer]);

  function resetVoice() {
    stopTimer();
    recorderRef.current = null;
    chunksRef.current = [];
    setRecording(false);
    setElapsedMs(0);
    setClip(null);
    setPreviewing(false);
    setMicError(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  }

  function handleStopRecording() {
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    stopTimer();
    setRecording(false);
    setPreviewing(false);
  }

  async function handleStartRecording() {
    if (recording || !hasCapability || disabled) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mimeType = pickMimeType();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = rec;
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' });
        const url = URL.createObjectURL(blob);
        stopTimer();
        const durationMs = Math.round(Date.now() - startTimeRef.current);
        setElapsedMs(0);
        setClip({ blob, mimeType: mimeType || 'audio/webm', durationMs });
        setPreviewUrl(url);
      };
      rec.start();
      startTimeRef.current = Date.now();
      setElapsedMs(0);
      setRecording(true);
      startTimer();
    } catch {
      setMicError('Microphone unavailable. Check browser permissions and try again.');
    }
  }

  function handleCancelClip() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    resetVoice();
  }

  function handleTogglePreview() {
    if (!previewUrl) return;
    if (previewing) {
      audioRef.current?.pause();
      setPreviewing(false);
      return;
    }
    const audio = audioRef.current ?? new Audio(previewUrl);
    audioRef.current = audio;
    audio.onended = () => setPreviewing(false);
    void audio.play().catch(() => setPreviewing(false));
    setPreviewing(true);
  }

  function handleSendVoice() {
    if (!clip || voiceSending || !onSendVoice) return;
    const sent = clip;
    resetVoice();
    onSendVoice(sent);
  }

  function handleCompose() {
    if (!canSend || !value.trim()) return;
    onSend(value.trim());
    setValue('');
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleCompose();
    }
  }

  useEffect(() => {
    return () => {
      stopTimer();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
      }
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [stopTimer, previewUrl]);

  const clipDuration = clip?.durationMs ?? elapsedMs;

  return (
    <div className="flex flex-col gap-1 px-3 pb-3 pt-2">
      <div className="flex items-end gap-2">
      <div
        className={cn(
          'flex min-h-11 flex-1 items-center gap-2 rounded-full border border-dojo-border bg-dojo-surface px-2 py-2 transition-shadow focus-within:border-dojo-accent/40 focus-within:ring-2 focus-within:ring-dojo-accent/20',
          disabled && 'opacity-60',
          recording && 'border-dojo-accent/40 ring-2 ring-dojo-accent/20',
        )}
      >
        {recording ? (
          <>
            {/* Recording state — tap the square to stop */}
            <span className="mx-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-dojo-accent/15">
              <span className="h-2 w-2 animate-pulse rounded-full bg-dojo-accent" />
            </span>
            <button
              type="button"
              onClick={handleStopRecording}
              aria-label="Stop recording"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-dojo-accent text-white transition-colors hover:bg-dojo-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-dojo-accent/50"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
            </button>
            <span className="select-none text-sm font-medium tabular-nums text-dojo-text-primary">
              {formatDuration(clipDuration)}
            </span>
            <span className="hidden truncate text-xs text-dojo-text-muted sm:inline">
              Recording… tap stop when done
            </span>
          </>
        ) : clip && previewUrl ? (
          <>
            {/* Preview: play + send/cancel */}
            <button
              type="button"
              onClick={handleTogglePreview}
              aria-label={previewing ? 'Pause preview' : 'Play preview'}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-dojo-accent text-white transition-colors hover:bg-dojo-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-dojo-accent/50"
            >
              {previewing || voiceSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PlayCircle className="h-5 w-5" />
              )}
            </button>
            <span className="select-none text-sm font-medium tabular-nums text-dojo-text-primary">
              <Mic className="mr-1 inline h-3.5 w-3.5 align-[-2px] text-dojo-text-muted" />
              {formatDuration(clip?.durationMs ?? 0)}
            </span>
            <span className="hidden truncate text-xs text-dojo-text-muted sm:inline">Voice message</span>
            {/* Cancel */}
            <button
              type="button"
              onClick={handleCancelClip}
              disabled={voiceSending}
              aria-label="Discard recording"
              className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-dojo-text-muted transition-colors hover:bg-dojo-surface-raised hover:text-dojo-text-primary"
            >
              <X className="h-4 w-4" />
            </button>
          </>
        ) : (
          <>
            {/* Mic button */}
            <button
              type="button"
              onClick={handleStartRecording}
              disabled={disabled || voiceSending || !hasCapability}
              aria-label="Record voice message"
              title={hasCapability ? 'Record a voice message' : 'Voice messages are not supported in this browser'}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-dojo-text-muted transition-colors hover:bg-dojo-surface-raised hover:text-dojo-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-dojo-accent/50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Mic className="h-4 w-4" />
            </button>
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={disabled ? 'Loading room…' : 'Enter your message'}
              aria-label="Message"
              disabled={disabled || voiceSending}
              className="flex-1 bg-transparent text-sm text-dojo-text-primary placeholder:text-dojo-text-muted focus:outline-none"
            />
          </>
        )}
      </div>

      {clip && previewUrl ? (
        <button
          type="button"
          onClick={handleSendVoice}
          disabled={recording || voiceSending}
          aria-label="Send voice message"
          className="tap-target flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-dojo-accent text-white shadow-lg shadow-dojo-accent/25 transition-all hover:bg-dojo-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-dojo-accent/50 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          {voiceSending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        </button>
      ) : (
        <button
          type="button"
          onClick={handleCompose}
          disabled={!canSend}
          aria-label="Send message"
          className="tap-target flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-dojo-accent text-white shadow-lg shadow-dojo-accent/25 transition-all hover:bg-dojo-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-dojo-accent/50 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          <Send className="h-5 w-5" />
        </button>
      )}
      </div>

      {micError && (
        <p className="px-1 text-xs text-dojo-danger" role="alert">
          {micError}
        </p>
      )}
    </div>
  );
}