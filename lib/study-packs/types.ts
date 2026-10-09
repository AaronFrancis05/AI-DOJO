/**
 * Shapes of the JSON stored in `study_pack_items.payload` and
 * `srs_cards.payload`. Text marked "target" is the language being learned and
 * is rendered with translate="no"; text marked "native" is the learner's own
 * language.
 */

export const WEAK_POINT_CATEGORIES = ['grammar', 'vocab', 'pronunciation', 'register'] as const;
export type WeakPointCategory = (typeof WEAK_POINT_CATEGORIES)[number];

/** A rule the pack teaches, one per targeted weak point. */
export interface FocusPayload {
  category: WeakPointCategory;
  /** The weak point's normalized label (English, stable across sessions). */
  pattern: string;
  /** native: the pattern's name as the learner reads it. */
  title: string;
  /** native: the rule in two or three sentences. */
  rule: string;
  /** target: one correct example sentence. */
  example: string;
}

/** A corrected-sentence drill: spot and fix the learner's own kind of mistake. */
export interface DrillPayload {
  /** target: a sentence containing the mistake. */
  incorrect: string;
  /** target: the corrected sentence. */
  corrected: string;
  /** native: why, in one sentence. */
  note: string;
  pattern: string;
}

export interface DialogueLine {
  /** 'partner' is the other speaker; 'learner' is the line the learner practises. */
  speaker: 'partner' | 'learner';
  /** target */
  text: string;
  /** native */
  translation: string;
}

/** A short exchange that uses the weak patterns correctly. */
export interface DialoguePayload {
  /** native */
  title: string;
  lines: DialogueLine[];
}

export type StudyPackItemKind = 'focus' | 'drill' | 'dialogue';

export type SrsCardType = 'vocab' | 'sentence' | 'grammar';

/**
 * The faces of a non-vocab review card. `frontIsTarget`/`backIsTarget` say
 * which faces are in the language being learned, so the review page marks
 * them translate="no" and speaks only those. The instruction above the front
 * ("Correct this sentence") is UI copy chosen by card type, not stored here.
 */
export interface SrsCardPayload {
  front: string;
  frontIsTarget: boolean;
  back: string;
  backIsTarget: boolean;
  /** native, optional line shown with the answer. */
  note: string | null;
  /** target, optional example shown with the answer. */
  example: string | null;
}
