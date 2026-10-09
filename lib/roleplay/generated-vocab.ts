import { isRecord } from './api-types';

/**
 * One model-generated vocabulary item, validated. Shared by every route that
 * asks the model for a scenario's vocabulary: session creation for a
 * situation without a scenario, the admin custom-domain builder, and
 * learner-owned scenarios.
 */
export type VocabRow = {
  targetText: string;
  phonetic: string;
  translation: string;
  category: string;
  usageTip: string;
  formalityLevel: string;
};

export function parseGeneratedVocab(value: unknown): VocabRow | null {
  if (!isRecord(value)) return null;

  const targetText = String(value.targetText ?? '');
  const translation = String(value.translation ?? '');
  if (!targetText || !translation) return null;

  return {
    targetText,
    phonetic: String(value.phonetic ?? ''),
    translation,
    category: String(value.category ?? 'general'),
    usageTip: String(value.usageTip ?? ''),
    formalityLevel: typeof value.formalityLevel === 'string'
      && ['casual', 'polite', 'formal'].includes(value.formalityLevel)
      ? value.formalityLevel
      : 'polite',
  };
}
