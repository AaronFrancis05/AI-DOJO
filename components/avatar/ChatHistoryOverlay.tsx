"use client";

import { useEffect, useState, useCallback, useRef } from "react";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  text?: string;
  text_en?: string;
  text_ja?: string;
  character_name?: string;
  time: string;
};

const CHAT_HISTORY_EVENT = "avatar:chat-history";
const OPEN_REQUEST_EVENT = "avatar:open-chat-history";
const CLEAR_REQUEST_EVENT = "avatar:clear-chat-history";
const TIMEOUT_MS = 6000;


export default function ChatHistoryOverlay({
  open,
  onClose,
  instance,
  characterName,
}: {
  open: boolean;
  onClose: () => void;
  instance: string;
  characterName?: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [responseLanguage, setResponseLanguage] = useState<string>("en");
  const [avatarName, setAvatarName] = useState<string | undefined>(characterName);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const clearingRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const formatTime = useCallback((iso: string): string => {
    try {
      return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    } catch {
      return "";
    }
  }, []);

  useEffect(() => {
    function handleChatHistory(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (!detail || detail.instance !== instance) return;

      setMessages(Array.isArray(detail.history) ? detail.history : []);
      if (detail.avatarName) setAvatarName(detail.avatarName);
      if (detail.responseLanguage) setResponseLanguage(detail.responseLanguage);
      setLoading(false);
      setError(null);

      if (clearingRef.current) {
        clearingRef.current = false;
        setClearing(false);
        setConfirmingClear(false);
      }
    }

    window.addEventListener(CHAT_HISTORY_EVENT, handleChatHistory as EventListener);
    return () => {
      window.removeEventListener(CHAT_HISTORY_EVENT, handleChatHistory as EventListener);
    };
  }, [instance]);

  useEffect(() => {
    if (!open) {
      setConfirmingClear(false);
      return;
    }

    setLoading(true);
    setError(null);
    window.dispatchEvent(
      new CustomEvent(OPEN_REQUEST_EVENT, { detail: { instance } })
    );

    const timeout = setTimeout(() => {
      setLoading((cur) => {
        if (cur) setError("Couldn't load chat history. Check your connection and try again.");
        return false;
      });
    }, TIMEOUT_MS);

    return () => clearTimeout(timeout);
  }, [open, instance]);

  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [open, messages]);

  const handleClear = () => {
    setClearing(true);
    setError(null);
    clearingRef.current = true;
    window.dispatchEvent(
      new CustomEvent(CLEAR_REQUEST_EVENT, { detail: { instance } })
    );

    setTimeout(() => {
      if (clearingRef.current) {
        clearingRef.current = false;
        setClearing(false);
        setConfirmingClear(false);
        setError("Couldn't confirm the history was cleared. Try again.");
      }
    }, TIMEOUT_MS);
  };

  type DisplayBubble = { key: string; isUser: boolean; body: string; time: string };

  const showEn = responseLanguage === "en" || responseLanguage === "both";
  const showJa = responseLanguage === "ja" || responseLanguage === "both";

  const bubbles: DisplayBubble[] = [];
  messages.forEach((m, i) => {
    const time = m.time || "";
    if (m.role === "assistant") {
      const preferEn = showEn && m.text_en;
      const preferJa = showJa && m.text_ja;
      if (preferEn) bubbles.push({ key: `${i}-en`, isUser: false, body: m.text_en!, time });
      if (preferJa) bubbles.push({ key: `${i}-ja`, isUser: false, body: m.text_ja!, time });
      if (!preferEn && !preferJa) {
        const fallback = m.text_en || m.text_ja || m.text || m.content || "";
        if (fallback) bubbles.push({ key: `${i}-fallback`, isUser: false, body: fallback, time });
      }
    } else {
      const body = m.text || m.content || "";
      if (body) bubbles.push({ key: `${i}-user`, isUser: true, body, time });
    }
  });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-100 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-dojo-surface-raised border border-dojo-border shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-dojo-border">
          <div>
            <h3 className="text-base font-bold text-dojo-text-primary leading-tight">
              Chat history
            </h3>
            <p className="text-[11px] text-dojo-text-muted leading-tight">
              会話の記録{avatarName ? ` · ${avatarName}` : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close chat history"
            className="h-8 w-8 flex items-center justify-center rounded-full text-dojo-text-muted hover:bg-dojo-surface hover:text-dojo-text-primary transition cursor-pointer"
          >
            <svg className="w-4 h-4 fill-none stroke-current stroke-2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {loading && (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
              <p className="text-sm text-dojo-text-muted">Loading history…</p>
            </div>
          )}

          {error && !loading && (
            <div className="rounded-xl border border-dojo-danger/30 bg-dojo-danger/5 px-4 py-3">
              <p className="text-sm text-dojo-danger">{error}</p>
            </div>
          )}

          {!loading && !error && messages.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-1 py-12 text-center">
              <p className="text-sm font-medium text-dojo-text-primary">No messages yet</p>
              <p className="text-xs text-dojo-text-muted">
                Start talking and your conversation will show up here.
              </p>
            </div>
          )}

          {bubbles.map((b) => (
            <div key={b.key} className={`flex flex-col ${b.isUser ? "items-end" : "items-start"}`}>
              <div className="flex items-baseline gap-2 mb-1 px-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-dojo-text-muted">
                  {b.isUser ? "You" : avatarName || "Character"}
                </span>
                {b.time && (
                  <span className="text-[11px] text-dojo-text-muted/70">{formatTime(b.time)}</span>
                )}
              </div>
              <div
                className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
                  b.isUser
                    ? "bg-dojo-accent text-white"
                    : "bg-dojo-surface text-dojo-text-primary border border-dojo-border"
                }`}
              >
                {b.body}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        {messages.length > 0 && (
          <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-dojo-border">
            {confirmingClear ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-dojo-text-muted">Clear the whole conversation?</span>
                <button
                  onClick={handleClear}
                  disabled={clearing}
                  className="text-xs font-bold uppercase tracking-wide text-white bg-dojo-danger hover:opacity-90 disabled:opacity-50 rounded-full px-3 py-1.5 transition cursor-pointer"
                >
                  {clearing ? "Clearing…" : "Confirm"}
                </button>
                <button
                  onClick={() => setConfirmingClear(false)}
                  disabled={clearing}
                  className="text-xs font-medium text-dojo-text-muted hover:text-dojo-text-primary transition cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmingClear(true)}
                className="text-xs font-bold uppercase tracking-wide text-dojo-danger hover:opacity-80 transition cursor-pointer"
              >
                Reset chat
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}