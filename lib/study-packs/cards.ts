/**
 * Review cards from a study pack (PLAN.md 3.3): each drill becomes a
 * `sentence` card and each focus rule a `grammar` card, scheduled by the same
 * SM-2 queue as vocabulary (app/api/review/answer).
 */

import type { DrillPayload, FocusPayload, SrsCardPayload, SrsCardType } from './types';

export function sentenceCard(drill: DrillPayload): SrsCardPayload {
  return {
    front: drill.incorrect,
    frontIsTarget: true,
    back: drill.corrected,
    backIsTarget: true,
    note: drill.note || null,
    example: null,
  };
}

export function grammarCard(focus: FocusPayload): SrsCardPayload {
  return {
    front: focus.title,
    frontIsTarget: false,
    back: focus.rule,
    backIsTarget: false,
    note: null,
    example: focus.example || null,
  };
}

/** The card type a pack item produces, or null for items that are not reviewed (dialogues). */
export function cardTypeForItem(kind: string): Exclude<SrsCardType, 'vocab'> | null {
  if (kind === 'drill') return 'sentence';
  if (kind === 'focus') return 'grammar';
  return null;
}

/** Reads a stored card payload, or null when it is missing or malformed. */
export function parseCardPayload(raw: string | null): SrsCardPayload | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<SrsCardPayload>;
    if (typeof p.front !== 'string' || typeof p.back !== 'string') return null;
    return {
      front: p.front,
      frontIsTarget: p.frontIsTarget === true,
      back: p.back,
      backIsTarget: p.backIsTarget === true,
      note: typeof p.note === 'string' ? p.note : null,
      example: typeof p.example === 'string' ? p.example : null,
    };
  } catch {
    return null;
  }
}
