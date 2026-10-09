/**
 * Live captions in a 1:1 lesson (PLAN.md 4.8 part 4): who gets which kind by
 * default, and how much a day. Pure and client-safe.
 *
 * Captions fade out with level so they build understanding without becoming a
 * crutch: translated captions for A0–A1, English-only ("partial") at A2, off by
 * default from B1. The learner can always switch them; the default is what
 * changes. They only ever render on screen — the audio is never translated.
 */

import { compareCefr, type CefrLevel } from '@/lib/interview/cefr';

/**
 * 'translated': the tutor's speech, translated into the learner's language.
 * 'transcript': the tutor's speech as English text, no translation.
 */
export type CaptionMode = 'translated' | 'transcript' | 'off';

export function defaultCaptionMode(level: CefrLevel | null): CaptionMode {
  if (!level || compareCefr(level, 'A1') <= 0) return 'translated';
  if (level === 'A2') return 'transcript';
  return 'off';
}

/**
 * Daily caption minutes by level. Azure bills per audio minute, and the
 * learners who need captions most get the most of them.
 */
export function dailyCaptionMinutes(level: CefrLevel | null): number {
  if (!level || compareCefr(level, 'A1') <= 0) return 90;
  if (level === 'A2') return 60;
  return 30;
}

/** How often the browser reports caption time, and the most one report may claim. */
export const CAPTION_REPORT_INTERVAL_SECONDS = 60;
export const MAX_CAPTION_REPORT_SECONDS = 120;
