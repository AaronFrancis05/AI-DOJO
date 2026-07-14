'use client';

import { useState, useRef, useCallback } from 'react';
import { Mic, Keyboard, Send, VolumeX, Settings2 } from 'lucide-react';
import { roleplayCapabilities } from '@/lib/roleplay/capabilities';
import { stop as stopTts } from '@/lib/roleplay/tts';

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
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  const startListening = useCallback(() => {
    if (roleplayCapabilities.stt === 'disabled') return;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = 'ja-JP';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setText(transcript);
      setIsListening(false);
      onSend(transcript);
    };

    recognition.onerror = () => { setIsListening(false); };
    recognition.onend = () => { setIsListening(false); };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [onSend]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

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

  if (showTextInput) {
    return (
      <div className="flex items-center gap-2 sm:gap-3">
        <button
          onClick={toggleMute}
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-colors ${
            muted
              ? 'bg-dojo-danger text-white border-dojo-danger'
              : 'bg-dojo-surface-raised border-dojo-border text-dojo-text-muted hover:text-dojo-text-primary'
          }`}
          title={muted ? 'Unmute' : 'Mute'}
        >
          <VolumeX className="h-5 w-5" />
        </button>

        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your response in Japanese..."
          disabled={disabled}
          className="min-w-0 flex-1 rounded-[--radius-md] bg-dojo-surface border border-dojo-border px-3 sm:px-4 py-2.5 text-sm text-dojo-text-primary placeholder:text-dojo-text-muted outline-none focus:border-dojo-accent transition-colors disabled:opacity-50"
        />

        <button
          onClick={handleSend}
          disabled={!text.trim() || disabled}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[--radius-md] bg-dojo-accent text-white transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Send className="h-4 w-4" />
        </button>

        <button
          onClick={onToggleTextInput}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-dojo-surface-raised border border-dojo-border text-dojo-text-muted hover:text-dojo-text-primary transition-colors"
          title="Switch to voice control"
        >
          <Mic className="h-5 w-5" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center gap-4">
      <button
        onClick={toggleMute}
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-colors ${
          muted
            ? 'bg-dojo-danger text-white border-dojo-danger'
            : 'bg-dojo-surface-raised border-dojo-border text-dojo-text-muted hover:text-dojo-text-primary'
        }`}
        title={muted ? 'Unmute' : 'Mute'}
      >
        <VolumeX className="h-5 w-5" />
      </button>

      <button
        onMouseDown={startListening}
        onMouseUp={stopListening}
        onMouseLeave={stopListening}
        onTouchStart={startListening}
        onTouchEnd={stopListening}
        className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full transition-all ${
          isListening
            ? 'bg-dojo-danger text-white scale-110 shadow-lg shadow-dojo-danger/30'
            : 'bg-dojo-accent text-white hover:scale-105 shadow-md'
        }`}
        title={isListening ? 'Release to send' : 'Hold to talk'}
        disabled={disabled || roleplayCapabilities.stt === 'disabled'}
      >
        <Mic className="h-7 w-7" />
      </button>

      <button
        onClick={onToggleTextInput}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-dojo-surface-raised border border-dojo-border text-dojo-accent hover:text-dojo-text-primary transition-colors"
        title="Switch to text input"
      >
        <Keyboard className="h-5 w-5" />
      </button>

      <button
        onClick={onPause}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-dojo-surface-raised border border-dojo-border text-dojo-text-muted hover:text-dojo-text-primary transition-colors"
        title="Settings & Pause"
      >
        <Settings2 className="h-5 w-5" />
      </button>
    </div>
  );
}
