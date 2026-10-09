/**
 * Tutor quality rules (PLAN.md 4.4, 4.6), as pure functions.
 *
 * Two signals: learners' star ratings, and how often the tutor's own scores
 * agree with the AI's (`tutor_evaluations.agreesWithAi`). Neither unlists a
 * tutor; falling below a threshold flags them for a human re-review.
 */

/** Below this average rating, with enough reviews, a tutor is flagged. */
export const MIN_AVERAGE_RATING = 4.0;
/** Below this share of evaluations agreeing with the AI, a tutor is flagged. */
export const MIN_AGREEMENT_RATE = 0.6;
/** Neither signal means anything on fewer samples than this. */
export const MIN_QUALITY_SAMPLES = 5;

export interface TutorQualityStats {
  reviewCount: number;
  averageRating: number | null;
  evaluationCount: number;
  /** Share of evaluations marked 'agrees', 0-1. */
  agreementRate: number | null;
}

/** The re-review reason, or null when the tutor is above both thresholds (or too new to judge). */
export function qualityFlagReason(stats: TutorQualityStats): string | null {
  const reasons: string[] = [];
  if (stats.reviewCount >= MIN_QUALITY_SAMPLES && stats.averageRating != null && stats.averageRating < MIN_AVERAGE_RATING) {
    reasons.push(`average rating ${stats.averageRating.toFixed(2)} over ${stats.reviewCount} reviews (minimum ${MIN_AVERAGE_RATING})`);
  }
  if (stats.evaluationCount >= MIN_QUALITY_SAMPLES && stats.agreementRate != null && stats.agreementRate < MIN_AGREEMENT_RATE) {
    reasons.push(`agrees with the AI on ${Math.round(stats.agreementRate * 100)}% of ${stats.evaluationCount} evaluations (minimum ${Math.round(MIN_AGREEMENT_RATE * 100)}%)`);
  }
  return reasons.length > 0 ? `Below threshold: ${reasons.join('; ')}.` : null;
}

export interface TrialLessonScores {
  correctionQuality: number;
  talkTimeBalance: number;
  levelAdaptation: number;
}

export const TRIAL_RUBRIC_KEYS = ['correctionQuality', 'talkTimeBalance', 'levelAdaptation'] as const;
/** Each rubric line is 1-5; every one must reach this to pass. */
export const TRIAL_MIN_SCORE = 3;

export function normalizeTrialScores(raw: unknown): TrialLessonScores | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  const out = {} as TrialLessonScores;
  for (const key of TRIAL_RUBRIC_KEYS) {
    const n = Number(source[key]);
    if (!Number.isInteger(n) || n < 1 || n > 5) return null;
    out[key] = n;
  }
  return out;
}

export function parseTrialScores(stored: string | null | undefined): TrialLessonScores | null {
  if (!stored) return null;
  try {
    return normalizeTrialScores(JSON.parse(stored));
  } catch {
    return null;
  }
}

/** Minimum Azure pronunciation-assessment accuracy over the read-aloud passages. */
export const MIN_CLARITY_SCORE = 80;

export interface VettingEvidence {
  proficiencyPassed: boolean;
  proficiencyReason: string | null;
  clarityScore: number | null;
  trialScores: TrialLessonScores | null;
  teachingModuleCompleted: boolean;
}

/** What still stands between an applicant and approval; empty when they may be verified. */
export function vettingGaps(evidence: VettingEvidence): string[] {
  const gaps: string[] = [];
  if (!evidence.proficiencyPassed) gaps.push(evidence.proficiencyReason ?? 'Proficiency interview not passed.');
  if (evidence.clarityScore == null) gaps.push('Clarity check not taken.');
  else if (evidence.clarityScore < MIN_CLARITY_SCORE) gaps.push(`Clarity ${evidence.clarityScore} is below ${MIN_CLARITY_SCORE}.`);
  if (!evidence.teachingModuleCompleted) gaps.push('Teaching-method module not completed.');
  if (!evidence.trialScores) gaps.push('Trial lesson not scored.');
  else if (Object.values(evidence.trialScores).some((v) => v < TRIAL_MIN_SCORE)) {
    gaps.push(`Trial lesson has a rubric line below ${TRIAL_MIN_SCORE}/5.`);
  }
  return gaps;
}
