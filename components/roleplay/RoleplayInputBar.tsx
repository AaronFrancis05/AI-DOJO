'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, Keyboard, Send, VolumeX, Settings2, MoreHorizontal } from 'lucide-react';
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

  useEffect(() => {
    if (showTextInput && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showTextInput]);

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      {/* -- Toolbar Area -- */}
      <div className="flex items-center justify-between w-full px-2">
         <div className="flex items-center gap-1.5">
           <button
             onClick={toggleMute}
             className={cn(
               "flex h-9 w-9 items-center justify-center rounded-full border transition-all duration-200 shadow-sm",
               muted
                 ? "bg-dojo-danger text-white border-dojo-danger"
                 : "bg-white/5 border-white/10 text-dojo-text-muted hover:text-dojo-text-primary hover:bg-white/10"
             )}
             title={muted ? 'Unmute' : 'Mute AI'}
           >
             <VolumeX className="h-4 w-4" />
           </button>
           <button
             onClick={onPause}
             className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 border border-white/10 text-dojo-text-muted hover:text-dojo-text-primary hover:bg-white/10 transition-all duration-200 shadow-sm"
             title="Settings & Pause"
           >
             <Settings2 className="h-4 w-4" />
           </button>
         </div>

         <button
           onClick={onToggleTextInput}
           className={cn(
             "flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all duration-200 text-[10px] font-bold tracking-widest uppercase shadow-sm",
             showTextInput 
               ? "bg-dojo-accent/20 border-dojo-accent text-dojo-accent" 
               : "bg-white/5 border-white/10 text-dojo-text-muted hover:text-dojo-text-primary"
           )}
         >
           {showTextInput ? <Mic className="h-3 w-3" /> : <Keyboard className="h-3 w-3" />}
           {showTextInput ? "Voice Mode" : "Keyboard"}
         </button>
      </div>

      {/* -- Main Input Area -- */}
      <div className="relative w-full group">
        {showTextInput ? (
          <div className="flex items-center gap-2 p-1.5 bg-dojo-surface-raised/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl transition-all duration-300 focus-within:border-dojo-accent/50 focus-within:ring-4 focus-within:ring-dojo-accent/10">
            <input
              ref={inputRef}
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Responder en japonés..."
              disabled={disabled}
              className="flex-1 bg-transparent border-none px-4 py-3 text-sm text-dojo-text-primary placeholder:text-dojo-text-muted/50 outline-none"
            />
            <button
              onClick={handleSend}
              disabled={!text.trim() || disabled}
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-all duration-200",
                text.trim() 
                  ? "bg-dojo-accent text-white shadow-lg shadow-dojo-accent/25" 
                  : "bg-white/5 text-dojo-text-muted opacity-40 cursor-not-allowed"
              )}
            >
              <Send className="h-5 w-5" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <div className="relative">
              {/* Outer pulsing ring for active listening */}
              {isListening && (
                <div className="absolute inset-0 rounded-full bg-dojo-danger animate-ping opacity-20" />
              )}
              
              <button
                onMouseDown={startListening}
                onMouseUp={stopListening}
                onMouseLeave={stopListening}
                onTouchStart={startListening}
                onTouchEnd={stopListening}
                className={cn(
                  "relative flex h-24 w-24 shrink-0 items-center justify-center rounded-full border-4 transition-all duration-300 shadow-2xl",
                  isListening
                    ? "bg-dojo-danger border-white/20 text-white scale-110 shadow-dojo-danger/40"
                    : "bg-dojo-accent border-white/10 text-white hover:scale-105 hover:bg-dojo-accent/90"
                )}
                disabled={disabled || roleplayCapabilities.stt === 'disabled'}
              >
                <Mic className={cn("h-10 w-10 transition-transform duration-300", isListening && "scale-90")} />
              </button>
            </div>
            <p className={cn(
              "mt-3 text-[11px] font-bold tracking-widest uppercase transition-all duration-300",
              isListening ? "text-dojo-danger animate-pulse" : "text-dojo-text-muted"
            )}>
              {isListening ? "Listening..." : "Hold to Talk"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}