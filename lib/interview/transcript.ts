/**
 * The interview transcript: its shape, and the sizing it gets before storage.
 *
 * ── Where it comes from, and what that means ──────────────────────────
 * The Live socket runs browser ↔ Google. The server mints a token and later
 * receives a transcript; it never witnesses the audio. So the transcript is
 * CLIENT-REPORTED, and a determined learner could post a flattering one.
 *
 * That is a deliberate, bounded trade: routing the audio through this server
 * would mean a stateful WebSocket relay per learner, which Next.js route
 * handlers cannot host, and the alternative — trusting a browser — is
 * acceptable *here* because of what the score is for. An AI interview stands
 * in for an absent tutor; `ai_interviews` is a separate table precisely so a
 * machine verdict never enters `tutor_evaluations`, and the returning tutor
 * reads the transcript before filing their own. The scores are evidence, not
 * a certificate.
 *
 * What IS enforced server-side: the rubric (locked into the ephemeral token,
 * so the examiner's brief cannot be rewritten from the browser), one
 * interview per learner per assessment (the unique `queue_slot_id`), one
 * submission (the row's status machine), and the bounds below.
 */

import {
  MAX_TRANSCRIPT_TEXT_CHARS,
  MAX_TRANSCRIPT_TOTAL_CHARS,
  MAX_TRANSCRIPT_TURNS,
} from './config';

export type InterviewSpeaker = 'examiner' | 'learner';

export interface InterviewTurn {
  speaker: InterviewSpeaker;
  text: string;
  /** Milliseconds from the start of the interview. Display only. */
  at: number;
}

export interface NormalizedTranscript {
  turns: InterviewTurn[];
  /** Learner turns only — the examiner's own lines are not evidence. */
  learnerTurns: number;
  /** True when bounds were hit, so the caller can say so rather than pretend. */
  truncated: boolean;
}

function coerceTurn(raw: unknown): InterviewTurn | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const value = raw as Record<string, unknown>;

  const speaker = value.speaker === 'learner' ? 'learner' : value.speaker === 'examiner' ? 'examiner' : null;
  if (!speaker) return null;

  const text = typeof value.text === 'string' ? value.text.trim() : '';
  if (!text) return null;

  const at = Number(value.at);

  return {
    speaker,
    text: text.slice(0, MAX_TRANSCRIPT_TEXT_CHARS),
    // Negative or non-finite offsets are a broken clock, not a reason to drop
    // an otherwise good turn.
    at: Number.isFinite(at) && at >= 0 ? Math.round(at) : 0,
  };
}

/**
 * Coerces whatever the browser posted into a bounded, well-typed transcript.
 *
 * Keeps the EARLIEST turns when the count overflows, not the latest: an
 * interview's opening is where the examiner's questions and the learner's
 * first unrehearsed answers are, and that is what a grader needs.
 */
export function normalizeTranscript(raw: unknown): NormalizedTranscript {
  if (!Array.isArray(raw)) {
    return { turns: [], learnerTurns: 0, truncated: false };
  }

  let truncated = raw.length > MAX_TRANSCRIPT_TURNS;
  const turns: InterviewTurn[] = [];
  let totalChars = 0;

  for (const item of raw.slice(0, MAX_TRANSCRIPT_TURNS)) {
    const turn = coerceTurn(item);
    if (!turn) continue;
    if (totalChars + turn.text.length > MAX_TRANSCRIPT_TOTAL_CHARS) {
      truncated = true;
      break;
    }
    totalChars += turn.text.length;
    turns.push(turn);
  }

  return {
    turns,
    learnerTurns: turns.filter((t) => t.speaker === 'learner').length,
    truncated,
  };
}

/** Reads back what was stored. JSON in a text column, per the project's convention. */
export function parseStoredTranscript(stored: string | null): InterviewTurn[] {
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? normalizeTranscript(parsed).turns : [];
  } catch {
    return [];
  }
}

/** Renders the transcript for a grading prompt. */
export function transcriptToText(
  turns: InterviewTurn[],
  names: { examiner: string; learner: string },
): string {
  return turns
    .map((t) => `${t.speaker === 'examiner' ? names.examiner : names.learner}: ${t.text}`)
    .join('\n');
}
