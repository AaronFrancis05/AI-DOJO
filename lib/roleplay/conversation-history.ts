import type { ChatTurn } from '../ai-providers';

/** The subset of a `conversations` row needed to rebuild model history. */
export interface ConversationHistoryRow {
  speaker: string;
  messageTarget: string;
  messageNative: string | null;
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
 * The previous shared expression — `row.messageNative ?? row.messageTarget` —
 * looked like it handled both, but `??` only falls through on null/undefined.
 * An AI turn's `''` is neither, so EVERY assistant turn resolved to an empty
 * string and the model was replaying a conversation in which it had never
 * said anything. That is what drove the re-greeting, the repeated questions,
 * and the icebreaker looping the anti-loop prompt rules were written to mask.
 *
 * Empty turns are dropped rather than passed through: a blank `content` is
 * worse than an omitted turn (some providers reject empty parts outright).
 */
export function buildConversationHistory(rows: ConversationHistoryRow[]): ChatTurn[] {
  const history: ChatTurn[] = [];

  for (const row of rows) {
    const isAi = row.speaker === 'ai';
    const primary = isAi ? row.messageTarget : row.messageNative;
    const content = (primary || row.messageTarget || row.messageNative || '').trim();
    if (!content) continue;

    history.push({ role: isAi ? 'assistant' : 'user', content });
  }

  return history;
}
