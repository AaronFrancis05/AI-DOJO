import { db } from '../../src/db';
import { evaluations, sessions } from '../../src/schema';
import { and, desc, eq } from 'drizzle-orm';
import { computeCompositeScore } from './phase-engine';
import { cacheGet, cacheSet, cacheKeys, TTL } from '../cache';

export type DifficultyTier = 'beginner' | 'intermediate' | 'advanced';

const TIER_ORDER: DifficultyTier[] = ['beginner', 'intermediate', 'advanced'];

/** How many recent completed sessions feed the running estimate. */
const WINDOW = 5;

/**
 * Below this many scored sessions we don't have enough signal to move a
 * learner off the scenario's authored difficulty.
 */
const MIN_SESSIONS_FOR_ADAPTATION = 3;

/** Consistently at or above this → ready for the next tier up. */
const PROMOTE_AT = 85;

/** Consistently at or below this → the current tier is too hard. */
const DEMOTE_AT = 55;

export interface LearnerProficiency {
  /** Mean composite (0-100) over the recent window, or null if no data. */
  averageScore: number | null;
  /** How many completed, scored sessions the average is based on. */
  sampleSize: number;
}

function clampTier(index: number): DifficultyTier {
  return TIER_ORDER[Math.max(0, Math.min(TIER_ORDER.length - 1, index))];
}

function normalizeTier(value: string | null | undefined): DifficultyTier {
  return TIER_ORDER.includes(value as DifficultyTier)
    ? (value as DifficultyTier)
    : 'beginner';
}

/**
 * Recent performance for one learner in one target language.
 *
 * Reads from `evaluations` (the per-session record written when a session
 * completes) rather than the live `sessions` columns, so an in-progress
 * session can't skew its own difficulty mid-conversation.
 */
export async function getLearnerProficiency(
  userId: string,
  targetLanguage: string,
): Promise<LearnerProficiency> {
  const key = cacheKeys.learnerProficiency(userId, targetLanguage);
  const cached = await cacheGet<LearnerProficiency>(key);
  if (cached) return cached;

  let result: LearnerProficiency = { averageScore: null, sampleSize: 0 };

  try {
    const rows = await db
      .select({
        vocabularyScore: evaluations.vocabularyScore,
        grammarScore: evaluations.grammarScore,
        fluencyScore: evaluations.fluencyScore,
        culturalScore: evaluations.culturalScore,
        taskScore: evaluations.taskScore,
        expressionAppropriatenessScore: evaluations.expressionAppropriatenessScore,
      })
      .from(evaluations)
      .innerJoin(sessions, eq(evaluations.sessionId, sessions.id))
      .where(and(
        eq(sessions.userId, userId),
        eq(sessions.targetLanguage, targetLanguage),
      ))
      .orderBy(desc(evaluations.createdAt))
      .limit(WINDOW);

    if (rows.length > 0) {
      const total = rows.reduce(
        (sum, r) => sum + computeCompositeScore('completed', r),
        0,
      );
      result = {
        averageScore: Math.round(total / rows.length),
        sampleSize: rows.length,
      };
    }
  } catch (err) {
    // Difficulty adaptation is an enhancement, never a reason to fail a turn.
    console.warn('[PROFICIENCY] lookup failed, using authored difficulty:', err);
  }

  await cacheSet(key, result, TTL.PROFICIENCY);
  return result;
}

/**
 * Chooses the difficulty the character should actually play at.
 *
 * The scenario's authored `difficulty` is the starting point, not the verdict:
 * a learner who has cleared several sessions comfortably should be stretched,
 * and one who keeps struggling should be met where they are. Movement is
 * capped at one tier in either direction so a single unusual session can't
 * throw someone from beginner to advanced.
 */
export function resolveDifficulty(
  authored: string | null | undefined,
  proficiency: LearnerProficiency,
): DifficultyTier {
  const base = normalizeTier(authored);
  const baseIndex = TIER_ORDER.indexOf(base);

  if (
    proficiency.averageScore === null ||
    proficiency.sampleSize < MIN_SESSIONS_FOR_ADAPTATION
  ) {
    return base;
  }

  if (proficiency.averageScore >= PROMOTE_AT) return clampTier(baseIndex + 1);
  if (proficiency.averageScore <= DEMOTE_AT) return clampTier(baseIndex - 1);
  return base;
}
