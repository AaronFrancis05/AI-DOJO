/**
 * Dojo adapter — replaces ai-avatar-ui's CharacterBrain backend calls
 * with AI DOJO's session-based system. Keeps the same surface so any
 * ported UI (AvatarController, captions queue) continues to work without
 * a separate Python backend.
 *
 * ai-avatar-ui protocol:
 *   POST /ask       -> {reply, translated_reply, expression, animation, audio_url_*, visemes_*}
 *   GET  /history   -> {history: []}
 *   GET  /settings  -> {last_avatar, ui_language, response_language, persona_overrides}
 *   POST /reset
 *
 * DOJO mapping:
 *   /ask       -> POST /api/chat/stream (SSE) + GET /api/sessions/[id] for analysis metadata
 *               Stream is collected non-streamingly for the widget contract.
 *               TTS is via /api/tts (Azure) — audio_url is synthesized client-side.
 *   /history   -> GET /api/sessions/[id] -> conversations[]
 *   /settings  -> GET /api/user/preferences + /api/user/avatars (graceful fallback)
 *   /translate -> local no-op (DOJO's prompt handles localization)
 */

export interface DojoBrainOptions {
  sessionId?: number | string;
  instanceId?: string;
}

export interface AvatarBehavior {
  reply: string;
  translated_reply: string;
  romanization: string;
  expression: string;
  animation: string;
  voice: string;
  primary: string;
  audio_url: string;
  audio_url_en: string;
  audio_url_ja: string;
  visemes: { id: number; offsetMs: number }[];
  visemes_en: { id: number; offsetMs: number }[];
  visemes_ja: { id: number; offsetMs: number }[];
  _offline?: boolean;
}

type SseState = { fullText: string; emotionTone?: string; gestureHint?: string };

function handleSseLine(line: string, state: SseState): void {
  if (!line.startsWith("data: ")) return;
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(line.slice(6)) as Record<string, unknown>;
  } catch { return; }
  if (payload.type === "token" && typeof payload.text === "string") {
    state.fullText += payload.text as string;
  }
  if (payload.type === "text_done" && typeof payload.fullText === "string") {
    state.fullText = payload.fullText as string;
  }
  const analysis = (payload as { analysis?: { emotionTone?: string; gestureHint?: string } }).analysis;
  if (analysis?.emotionTone) state.emotionTone = analysis.emotionTone;
  if (analysis?.gestureHint) state.gestureHint = analysis.gestureHint;
  if (payload.type === "done") {
    const doneAnalysis = (payload as { analysis?: { emotionTone?: string; gestureHint?: string } }).analysis;
    if (doneAnalysis?.emotionTone) state.emotionTone = doneAnalysis.emotionTone;
    if (doneAnalysis?.gestureHint) state.gestureHint = doneAnalysis.gestureHint;
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function sseParse(streamText: string): { fullText: string; emotionTone?: string; gestureHint?: string } {
  const state: SseState = { fullText: "" };
  for (const line of streamText.split("\n")) {
    handleSseLine(line, state);
  }
  return state;
}

export class DojoBrainAdapter {
  sessionId: string | number | null;
  instanceId: string;
  userTimezone: string;

  constructor(opts: DojoBrainOptions = {}) {
    this.sessionId = opts.sessionId ?? null;
    this.instanceId = opts.instanceId ?? "default";
    this.userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  }

  setSessionId(id: string | number | null): void {
    this.sessionId = id;
  }

  async ask(
    text: string,
    _persona?: string | null,
    _avatarPersona?: string | null,
    _voices: { en?: string; ja?: string } = {},
    _characterName?: string | null,
    _speakLanguage = "en",
  ): Promise<AvatarBehavior> {
    if (!this.sessionId) {
      return this.offlineBehavior(text);
    }

    const numericSessionId = Number(this.sessionId);
    if (!Number.isFinite(numericSessionId)) {
      throw new Error(`Invalid sessionId for ask: ${String(this.sessionId)}`);
    }

    const streamController = new AbortController();
    const streamTimeout = setTimeout(() => streamController.abort(), 30_000);
    try {
      const res = await fetch(`/api/chat/stream`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: numericSessionId,
          userRawInput: text,
        }),
        signal: streamController.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`chat/stream ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const sseState: SseState = { fullText: "" };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          handleSseLine(line, sseState);
        }
      }
      // flush remaining buffer
      if (buffer.startsWith("data: ")) {
        handleSseLine(buffer, sseState);
      }
      const fullText = sseState.fullText;
      const emotionTone = sseState.emotionTone;
      const gestureHint = sseState.gestureHint;

      // TTS — reuse DOJO's existing endpoint; visemes are delivered here
      // for LipSync. Failure falls back to text-only behavior (no audio).
      let audioUrl = "";
      let visemes: { id: number; offsetMs: number }[] = [];
      const ttsController = new AbortController();
      const ttsTimeout = setTimeout(() => ttsController.abort(), 15_000);
      try {
        // language is inferred from session; pass raw reply for now
        const ttsRes = await fetch(`/api/tts`, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: fullText, lang: _speakLanguage === "ja" ? "ja-JP" : "en-US" }),
          signal: ttsController.signal,
        });
        if (ttsRes.ok) {
          const ttsData = await ttsRes.json();
          // DOJO returns {audio: base64, visemes} — synthesize a data URL
          if (ttsData.audio) {
            audioUrl = `data:audio/mp3;base64,${ttsData.audio}`;
            visemes = ttsData.visemes ?? [];
          }
        }
      } catch { /* TTS optional */ }
      finally {
        clearTimeout(ttsTimeout);
      }

      return {
        reply: fullText,
        translated_reply: "",
        romanization: "",
        expression: emotionTone ?? "neutral",
        animation: gestureHint ?? "talk",
        voice: _voices?.en ?? "en-US",
        primary: "en",
        audio_url: audioUrl,
        audio_url_en: audioUrl,
        audio_url_ja: "",
        visemes,
        visemes_en: visemes,
        visemes_ja: [],
      };
    } catch {
      return this.offlineBehavior(text);
    } finally {
      clearTimeout(streamTimeout);
    }
  }

  async history(): Promise<{ history: { role: string; text: string; time?: string }[] }> {
    if (!this.sessionId) return { history: [] };
    try {
      const res = await fetch(`/api/sessions/${this.sessionId}`, { credentials: "include" });
      if (!res.ok) return { history: [] };
      const data = await res.json();
      const conversations: { speaker: string; messageTarget: string; messageNative?: string; createdAt?: string }[] = data.conversations ?? [];
      return {
        history: conversations.map((c) => ({
          role: c.speaker === "user" ? "user" : "assistant",
          text: c.messageTarget ?? c.messageNative ?? "",
          time: c.createdAt,
        })),
      };
    } catch {
      return { history: [] };
    }
  }

  async getSettings(): Promise<{ ui_language: string; response_language: string; last_avatar: string; persona_overrides: Record<string, unknown> }> {
    try {
      const [prefsRes, avatarsRes] = await Promise.allSettled([
        fetch(`/api/user/preferences`, { credentials: "include" }).then((r) => (r.ok ? r.json() : null)),
        fetch(`/api/user/avatars`, { credentials: "include" }).then((r) => (r.ok ? r.json() : null)),
      ]);
      const prefs = prefsRes.status === "fulfilled" ? prefsRes.value : null;
      const avatars = avatarsRes.status === "fulfilled" ? avatarsRes.value : null;
      const selected = avatars?.avatars?.find((a: { isSelected?: boolean; avatarUrl?: string }) => a.isSelected)?.avatarUrl ?? null;
      let lastAvatar = "";
      if (selected) {
        const m = String(selected).match(/\/([^/]+)\.glb$/);
        if (m) lastAvatar = m[1];
      }
      return {
        ui_language: "en",
        response_language: "en",
        last_avatar: lastAvatar,
        persona_overrides: (prefs as { persona_overrides?: Record<string, unknown> })?.persona_overrides ?? {},
      };
    } catch {
      return { ui_language: "en", response_language: "en", last_avatar: "", persona_overrides: {} };
    }
  }

  async saveSettings(_patch: Record<string, unknown>): Promise<Record<string, unknown>> {
    // DOJO persists avatar selection via /api/user/avatars/[id]/select; persona
    // overrides are not yet a first-class resource — keepalive best-effort.
    return _patch;
  }

  async translate(text: string, _target = "ja"): Promise<{ text: string }> {
    return { text };
  }

  async reset(): Promise<void> {
    // Session reset is via session lifecycle, not a global reset.
  }

  offlineBehavior(text: string): AvatarBehavior {
    return {
      reply: `(offline) I heard: "${text}". Start a session to enable the AI.`,
      translated_reply: "",
      romanization: "",
      expression: "neutral",
      animation: "offline",
      voice: "en-US",
      primary: "en",
      audio_url: "",
      audio_url_en: "",
      audio_url_ja: "",
      visemes: [],
      visemes_en: [],
      visemes_ja: [],
      _offline: true,
    };
  }
}
