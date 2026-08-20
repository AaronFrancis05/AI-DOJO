'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, Keyboard, Send, VolumeX, Settings2 } from 'lucide-react';
import { roleplayCapabilities } from '@/lib/roleplay/capabilities';
import { stop as stopTts } from '@/lib/roleplay/tts';
import { cn } from '@/lib/design-tokens';

interface RoleplayInputBarProps {
  onSend: (text: string) => void;
  onPause: () => void;
  disabled?: boolean;
  showTextInput?: boolean;
  onToggleTextInput?: () => void;
}

export function RoleplayInputBar({ onSend, onPause, disabled, showTextInput, onToggleTextInput }: RoleplayInputBarProps) {
  const [text, setText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [muted, setMuted] = useState(false);
  const [micReady, setMicReady] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const finalTranscriptRef = useRef('');

  useEffect(() => {
    if ('mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices) {
      navigator.mediaDevices.getUserMedia({ audio: true }).then(() => {
        setMicReady(true);
      }).catch(() => {});
    }
  }, []);

  const toggleListening = useCallback(() => {
    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
      setIsListening(false);
      const finalText = finalTranscriptRef.current.trim();
      if (finalText) {
        onSend(finalText);
        setText('');
        finalTranscriptRef.current = '';
      }
      return;
    }

    if (roleplayCapabilities.stt === 'disabled') return;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = 'ja-JP';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: any) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }
      if (final) {
        finalTranscriptRef.current += final;
        setText(finalTranscriptRef.current);
      } else {
        setText(finalTranscriptRef.current + interim);
      }
    };

    recognition.onerror = () => { setIsListening(false); };
    recognition.onend = () => {
      if (recognitionRef.current === recognition) {
        setIsListening(false);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isListening, onSend]);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
  }, [text, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const toggleMute = useCallback(() => {
    if (muted) {
      setMuted(false);
    } else {
      stopTts();
      setMuted(true);
    }
  }, [muted]);

  useEffect(() => {
    if (showTextInput && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showTextInput]);

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      {/* ── Main Input Area ── */}
      <div className="relative w-full">
        {showTextInput ? (
          <div className="flex items-center gap-2 p-2 bg-dojo-surface-raised/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl transition-all duration-300 focus-within:border-dojo-accent/40 focus-within:shadow-dojo-accent/10 focus-within:shadow-lg">
            <input
              ref={inputRef}
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              disabled={disabled}
              className="flex-1 bg-transparent border-none px-4 py-2 text-sm text-dojo-text-primary placeholder:text-dojo-text-muted/50 outline-none"
            />
            <button
              onClick={handleSend}
              disabled={!text.trim() || disabled}
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all duration-200",
                text.trim()
                  ? "bg-dojo-accent text-white shadow-lg shadow-dojo-accent/25 hover:opacity-90"
                  : "bg-white/5 text-dojo-text-muted opacity-40 cursor-not-allowed"
              )}
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-8">
            {/* Mute button */}
            <div className="flex flex-col items-center gap-1">
              <button
                onClick={toggleMute}
                className={cn(
                  "tap-target flex h-12 w-12 items-center justify-center rounded-full border transition-all duration-200",
                  muted
                    ? "bg-dojo-danger/20 text-dojo-danger border-dojo-danger/40"
                    : "bg-white/5 border-white/10 text-dojo-text-muted hover:text-dojo-text-primary hover:bg-white/10"
                )}
                title={muted ? 'Unmute' : 'Mute AI'}
              >
                <VolumeX className="h-5 w-5" />
              </button>
              <span className="text-[10px] text-dojo-text-muted/60 font-medium">Mute</span>
            </div>

            {/* Mic button */}
            <div className="flex flex-col items-center gap-2">
              <div className="relative">
                {isListening && (
                  <>
                    <span className="absolute inset-0 rounded-full bg-dojo-warning/30 animate-ping" />
                    <span className="absolute -inset-2 rounded-full border-2 border-dojo-warning/20 animate-pulse" />
                  </>
                )}
                <button
                  onClick={toggleListening}
                  className={cn(
                    "relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full transition-all duration-300",
                    isListening
                      ? "bg-dojo-warning text-white scale-110 shadow-[0_0_32px_rgba(242,169,59,0.5)] ring-4 ring-dojo-warning/20"
                      : "bg-dojo-accent text-white hover:scale-105 shadow-[0_8px_24px_rgba(45,59,197,0.4)]"
                  )}
                  disabled={disabled || roleplayCapabilities.stt === 'disabled'}
                >
                  <Mic className={cn("h-7 w-7 transition-transform duration-300", isListening && "scale-90")} />
                </button>
              </div>
              <p className={cn(
                "text-[10px] font-bold tracking-widest uppercase transition-all duration-300",
                isListening ? "text-dojo-warning animate-pulse" : "text-dojo-text-muted/60"
              )}>
                {isListening ? "Listening..." : micReady ? "Tap to Speak" : "Allow Mic"}
              </p>
            </div>

            {/* Type button */}
            <div className="flex flex-col items-center gap-1">
              <button
                onClick={onToggleTextInput}
                className="tap-target flex h-12 w-12 items-center justify-center rounded-full bg-white/5 border border-white/10 text-dojo-text-muted hover:text-dojo-text-primary hover:bg-white/10 transition-all duration-200"
              >
                <Keyboard className="h-5 w-5" />
              </button>
              <span className="text-[10px] text-dojo-text-muted/60 font-medium">Type</span>
            </div>
          </div>
        )}
      </div>

      {/* Toggle back to voice when in text mode */}
      {showTextInput && (
        <div className="flex items-center justify-between w-full px-2">
          <button
            onClick={toggleMute}
            className={cn(
              "tap-target flex h-8 w-8 items-center justify-center rounded-full border transition-all duration-200",
              muted
                ? "bg-dojo-danger/20 text-dojo-danger border-dojo-danger/40"
                : "bg-white/5 border-white/10 text-dojo-text-muted hover:text-dojo-text-primary"
            )}
            title={muted ? 'Unmute' : 'Mute AI'}
          >
            <VolumeX className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onToggleTextInput}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/5 text-dojo-text-muted hover:text-dojo-text-primary text-[10px] font-bold tracking-widest uppercase transition-all duration-200"
          >
            <Mic className="h-3 w-3" />
            <span className="hidden xs:inline">Voice</span>
          </button>
          <button
            onClick={onPause}
            className="tap-target flex h-8 w-8 items-center justify-center rounded-full bg-white/5 border border-white/10 text-dojo-text-muted hover:text-dojo-text-primary transition-all duration-200"
            title="Settings"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}