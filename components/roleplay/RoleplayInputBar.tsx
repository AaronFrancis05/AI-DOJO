'use client';

import { useState, useRef, useCallback } from 'react';
import { Mic, Keyboard, Send, Pause, Settings2 } from 'lucide-react';
import { roleplayCapabilities } from '@/lib/roleplay/capabilities';

type InputMode = 'text' | 'voice';

interface RoleplayInputBarProps {
  onSend: (text: string) => void;
  onPause: () => void;
  disabled?: boolean;
}

export function RoleplayInputBar({ onSend, onPause, disabled }: RoleplayInputBarProps) {
  const [inputMode, setInputMode] = useState<InputMode>('text');
  const [text, setText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  const startListening = useCallback(() => {
    if (roleplayCapabilities.stt === 'disabled') {
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'ja-JP';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setText(transcript);
      setIsListening(false);
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, []);

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

  const toggleInputMode = useCallback(() => {
    if (isListening) stopListening();
    setInputMode((prev) => (prev === 'text' ? 'voice' : 'text'));
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [isListening, stopListening]);

  return (
    <div className="flex items-center gap-2 sm:gap-3">
      {inputMode === 'voice' ? (
        <button
          onClick={isListening ? stopListening : startListening}
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-colors ${
            isListening
              ? 'bg-dojo-danger text-white border-dojo-danger animate-pulse'
              : 'bg-dojo-surface-raised border-dojo-border text-dojo-text-muted hover:text-dojo-text-primary'
          }`}
          title={isListening ? 'Stop recording' : 'Hold to talk'}
          disabled={roleplayCapabilities.stt === 'disabled'}
        >
          <Mic className="h-5 w-5" />
        </button>
      ) : (
        <button
          onClick={toggleInputMode}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-dojo-surface-raised border border-dojo-border text-dojo-accent hover:text-dojo-text-primary transition-colors"
          title="Switch to voice input"
        >
          <Keyboard className="h-5 w-5" />
        </button>
      )}

      <input
        ref={inputRef}
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={
          inputMode === 'voice'
            ? 'Voice mode active...'
            : 'Type your response in Japanese...'
        }
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

      {roleplayCapabilities.tts === 'disabled' && inputMode === 'voice' && (
        <span className="hidden sm:block text-[10px] text-dojo-text-muted whitespace-nowrap">
          Text mode only
        </span>
      )}
    </div>
  );
}
