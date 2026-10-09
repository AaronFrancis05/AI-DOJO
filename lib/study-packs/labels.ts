import type { WeakPointCategory } from './types';

/** Display names for weak-point categories. Keyed by string so a stored value outside the enum still renders. */
export const WEAK_POINT_CATEGORY_LABELS: Record<WeakPointCategory | string, string> = {
  grammar: 'Grammar',
  vocab: 'Vocabulary',
  pronunciation: 'Pronunciation',
  register: 'Politeness & tone',
};
