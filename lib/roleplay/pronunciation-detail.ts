/**
 * Word- and phoneme-level pronunciation detail, parsed from Azure's
 * pronunciation-assessment JSON.
 *
 * Pure (no SDK import) so it can be unit tested. Azure already returns this
 * detail whenever granularity is Phoneme; assessPronunciation used to keep
 * only the overall accuracy and throw the rest away, which is exactly the
 * part that says WHICH sound a learner gets wrong (Japanese r/l, Spanish
 * vowel insertion, Arabic p/b — see lib/language-packs/en/pronunciationTargets).
 */

export interface PhonemeScore {
  phoneme: string;
  accuracyScore: number | null;
}

export interface WordPronunciation {
  word: string;
  accuracyScore: number | null;
  /** Azure's verdict: 'None' | 'Mispronunciation' | 'Omission' | 'Insertion' | ... */
  errorType: string;
  phonemes: PhonemeScore[];
}

/** Below this, a phoneme is reported as a weak sound. Azure's HundredMark scale. */
export const WEAK_PHONEME_THRESHOLD = 60;

interface RawPhoneme {
  Phoneme?: string;
  PronunciationAssessment?: { AccuracyScore?: number };
}

interface RawWord {
  Word?: string;
  PronunciationAssessment?: { AccuracyScore?: number; ErrorType?: string };
  Phonemes?: RawPhoneme[];
}

function score(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Accepts the SDK's `detailResult` (or the raw NBest[0] JSON) and never throws. */
export function parsePronunciationWords(detail: unknown): WordPronunciation[] {
  const words = (detail as { Words?: unknown } | null | undefined)?.Words;
  if (!Array.isArray(words)) return [];
  return (words as RawWord[]).map((w) => ({
    word: typeof w.Word === 'string' ? w.Word : '',
    accuracyScore: score(w.PronunciationAssessment?.AccuracyScore),
    errorType: w.PronunciationAssessment?.ErrorType ?? 'None',
    phonemes: (Array.isArray(w.Phonemes) ? w.Phonemes : [])
      .filter((p) => typeof p.Phoneme === 'string' && p.Phoneme.length > 0)
      .map((p) => ({ phoneme: p.Phoneme!, accuracyScore: score(p.PronunciationAssessment?.AccuracyScore) })),
  }));
}

/**
 * The sounds a learner got wrong, worst first, each with the words it
 * appeared in — the shape a weak-point model (PLAN.md 3.1) or a tutor
 * briefing wants, rather than a per-word dump.
 */
export function weakPhonemes(
  words: readonly WordPronunciation[],
  threshold: number = WEAK_PHONEME_THRESHOLD,
): Array<{ phoneme: string; averageScore: number; words: string[] }> {
  const byPhoneme = new Map<string, { total: number; count: number; words: Set<string> }>();
  for (const w of words) {
    for (const p of w.phonemes) {
      if (p.accuracyScore == null || p.accuracyScore >= threshold) continue;
      const entry = byPhoneme.get(p.phoneme) ?? { total: 0, count: 0, words: new Set<string>() };
      entry.total += p.accuracyScore;
      entry.count += 1;
      if (w.word) entry.words.add(w.word);
      byPhoneme.set(p.phoneme, entry);
    }
  }
  return [...byPhoneme]
    .map(([phoneme, e]) => ({ phoneme, averageScore: Math.round(e.total / e.count), words: [...e.words] }))
    .sort((a, b) => a.averageScore - b.averageScore || a.phoneme.localeCompare(b.phoneme));
}
