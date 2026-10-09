import type { ChatTurn } from '../ai-providers';

/** The subset of a `conversations` row needed to rebuild model history. */
export interface ConversationHistoryRow {
  speaker: string;
  messageTarget: string;
  messageNative: string | null;
}

/**
 * Text a transcript bubble should show.
 *
 * User turns store the full utterance in `messageNative` and only the
 * target-language spans in `messageTarget`. An English-only reply from a
 * Japanese-speaking learner therefore lands as `messageTarget: ''`, and a
 * bubble that reads `messageTarget` alone goes blank after analysis.
 */
export function displayedUtterance(row: {
  speaker?: string;
  messageTarget?: string | null;
  messageNative?: string | null;
}): string {
  const target = (row.messageTarget ?? '').trim();
  const native = (row.messageNative ?? '').trim();
  if (row.speaker === 'ai') return target;
  return target || native;
}

/**
 * Columns to persist for a learner turn. `messageTarget` may stay empty when
 * they produced no target-language text; `messageNative` always keeps what
 * they actually said so the bubble and history can fall back to it.
 */
export function persistableUserUtterance(
  analysis: { messageTarget?: string | null; messageNative?: string | null },
  rawInput: string,
): { messageTarget: string; messageNative: string } {
  return {
    messageTarget: (analysis.messageTarget ?? '').trim(),
    messageNative: (analysis.messageNative ?? '').trim() || rawInput.trim(),
  };
}

/**
 * Rebuilds the model-facing conversation history from persisted turns.
 *
 * The two speakers store their text in different columns, so neither one can
 * be read with a single fallback chain:
 *
 * - AI turns persist the reply verbatim in `messageTarget` and write
 *   `messageNative: ''` (see the inserts in app/api/chat/stream/route.ts).
 * - User turns persist the full utterance in `messageNative` and only the
 *   target-language spans they produced in `messageTarget`.
 *
 * `displayedUtterance` is the shared read. The previous expression —
 * `row.messageNative ?? row.messageTarget` — looked like it handled both, but
 * `??` only falls through on null/undefined. An AI turn's `''` is neither,
 * so EVERY assistant turn resolved to an empty string and the model was
 * replaying a conversation in which it had never said anything.
 *
 * Empty turns are dropped rather than passed through: a blank `content` is
 * worse than an omitted turn (some providers reject empty parts outright).
 */
export function buildConversationHistory(rows: ConversationHistoryRow[]): ChatTurn[] {
  const history: ChatTurn[] = [];

  for (const row of rows) {
    const content = displayedUtterance(row);
    if (!content) continue;
    history.push({ role: row.speaker === 'ai' ? 'assistant' : 'user', content });
  }

  return history;
}
