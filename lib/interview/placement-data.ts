/**
 * Reading and writing `cefr_placements`: the learner placement interview and
 * the tutor applicant's proficiency interview (PLAN.md 4.3, 4.6).
 *
 * The counterpart of ./data.ts for interviews that have no assessment room.
 * Same rules: re-entrant while live, so a dropped connection does not spend
 * the attempt; closed for good once completed.
 */

import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/src/db';
import { canDoProgress, cefrPlacements, courseLevels, tutors, units, users } from '@/src/schema';
import type { TurnScores } from '@/lib/ai-engine';
import { SCORE_DIMENSIONS } from '@/lib/roleplay/score-dimensions';
import {
  CEFR_LEVELS,
  compareCefr,
  isCefrLevel,
  PLACEMENT_RETEST_DAYS,
  proficiencyForCefr,
  type CefrLevel,
  type CefrVerdict,
} from './cefr';
import type { InterviewTurn } from './transcript';

export type PlacementPurpose = 'placement' | 'tutor_vetting';
export type PlacementRow = typeof cefrPlacements.$inferSelect;

export function isPlacementPurpose(value: unknown): value is PlacementPurpose {
  return value === 'placement' || value === 'tutor_vetting';
}

export async function loadLatestPlacement(
  userId: string,
  purpose: PlacementPurpose,
): Promise<PlacementRow | null> {
  const [row] = await db
    .select()
    .from(cefrPlacements)
    .where(and(eq(cefrPlacements.userId, userId), eq(cefrPlacements.purpose, purpose)))
    .orderBy(desc(cefrPlacements.createdAt))
    .limit(1);
  return row ?? null;
}

export async function loadPlacementById(id: number): Promise<PlacementRow | null> {
  const [row] = await db.select().from(cefrPlacements).where(eq(cefrPlacements.id, id)).limit(1);
  return row ?? null;
}

/**
 * When the next attempt opens, or null if one may start now. Only a GRADED
 * interview starts the clock: one the grader could not mark gave the caller
 * nothing, so it must not lock them out for a month.
 */
export function nextAttemptAt(latest: PlacementRow | null, now = new Date()): Date | null {
  if (!latest || latest.status !== 'completed' || !latest.endedAt || !latest.gradedAt) return null;
  const opens = new Date(latest.endedAt.getTime() + PLACEMENT_RETEST_DAYS * 24 * 60 * 60 * 1000);
  return opens > now ? opens : null;
}

export type StartPlacementResult =
  | { ok: true; placement: PlacementRow; resumed: boolean }
  | { ok: false; reason: string };

/**
 * Resumes the caller's live interview, or opens a new one when the re-test
 * window allows. A failed row is never resumed: it is evidence of an attempt
 * that produced nothing, and a fresh row keeps the transcript honest.
 */
export async function startPlacement(input: {
  userId: string;
  purpose: PlacementPurpose;
  targetLanguage: string;
  nativeLanguage: string;
  model: string;
}): Promise<StartPlacementResult> {
  const latest = await loadLatestPlacement(input.userId, input.purpose);

  if (latest?.status === 'live') {
    const [resumed] = await db
      .update(cefrPlacements)
      .set({ model: input.model, updatedAt: new Date() })
      .where(eq(cefrPlacements.id, latest.id))
      .returning();
    return { ok: true, placement: resumed, resumed: true };
  }

  const opens = nextAttemptAt(latest);
  if (opens) {
    return {
      ok: false,
      reason: `You can take the next interview from ${opens.toISOString().slice(0, 10)}.`,
    };
  }

  const [created] = await db
    .insert(cefrPlacements)
    .values({
      userId: input.userId,
      purpose: input.purpose,
      targetLanguage: input.targetLanguage,
      nativeLanguage: input.nativeLanguage,
      model: input.model,
      status: 'live',
    })
    .returning();
  return { ok: true, placement: created, resumed: false };
}

export async function failPlacement(id: number): Promise<void> {
  const now = new Date();
  await db
    .update(cefrPlacements)
    .set({ status: 'failed', endedAt: now, updatedAt: now })
    .where(eq(cefrPlacements.id, id));
}

/**
 * Files the finished interview and writes its level where the app reads it:
 * `users.cefrLevel` + `users.level` for a placement, `tutors.cefrLevel` +
 * `vettingPlacementId` for a vetting interview. An ungraded interview writes
 * no level anywhere — a missing verdict must never look like a low one.
 */
export async function completePlacement(input: {
  placement: PlacementRow;
  turns: InterviewTurn[];
  learnerTurns: number;
  scores: TurnScores | null;
  cefr: CefrVerdict | null;
  feedback: string | null;
  summary: string | null;
}): Promise<PlacementRow> {
  const { placement, turns, learnerTurns, scores, cefr, feedback, summary } = input;
  const now = new Date();

  const [saved] = await db
    .update(cefrPlacements)
    .set({
      status: 'completed',
      endedAt: now,
      learnerTurns,
      transcript: JSON.stringify(turns),
      vocabularyScore: scores?.vocabulary ?? null,
      grammarScore: scores?.grammar ?? null,
      fluencyScore: scores?.fluency ?? null,
      culturalScore: scores?.cultural ?? null,
      taskScore: scores?.task ?? null,
      expressionAppropriatenessScore: scores?.expressionAppropriateness ?? null,
      cefrLevel: cefr?.overall ?? null,
      dimensionLevels: cefr ? JSON.stringify(cefr.dimensions) : null,
      feedback,
      summary,
      gradedAt: scores ? now : null,
      updatedAt: now,
    })
    .where(eq(cefrPlacements.id, placement.id))
    .returning();

  if (cefr) {
    if (placement.purpose === 'placement') {
      await db
        .update(users)
        .set({
          cefrLevel: cefr.overall,
          cefrAssessedAt: now,
          level: proficiencyForCefr(cefr.overall),
        })
        .where(eq(users.id, placement.userId));
      await confirmAchievedCanDos(placement.userId, cefr.overall, now);
    } else {
      await db
        .update(tutors)
        .set({ cefrLevel: cefr.overall, vettingPlacementId: placement.id })
        .where(eq(tutors.userId, placement.userId));
    }
  }

  return saved;
}

/**
 * The re-test backs up the tutor's marks (PLAN.md 4.7): every can-do statement
 * a tutor marked 'achieved' in a unit at or below the level the learner was
 * just placed at is confirmed. Marks above that level stay unconfirmed until
 * a later re-test reaches them.
 */
async function confirmAchievedCanDos(userId: string, level: CefrLevel, now: Date): Promise<void> {
  const covered = CEFR_LEVELS.filter((l) => compareCefr(l, level) <= 0);
  const coveredUnits = db
    .select({ id: units.id })
    .from(units)
    .innerJoin(courseLevels, eq(units.levelId, courseLevels.id))
    .where(inArray(courseLevels.cefrLevel, covered));
  await db
    .update(canDoProgress)
    .set({ confirmedAt: now })
    .where(and(
      eq(canDoProgress.userId, userId),
      eq(canDoProgress.status, 'achieved'),
      isNull(canDoProgress.confirmedAt),
      inArray(canDoProgress.unitId, coveredUnits),
    ));
}

/** The stored verdict, rebuilt from its columns. */
export function placementVerdict(row: PlacementRow | null): CefrVerdict | null {
  if (!row || !isCefrLevel(row.cefrLevel)) return null;
  let dimensions: CefrVerdict['dimensions'] = {};
  try {
    const parsed = row.dimensionLevels ? JSON.parse(row.dimensionLevels) : {};
    for (const d of SCORE_DIMENSIONS) {
      if (isCefrLevel(parsed?.[d])) dimensions[d] = parsed[d] as CefrLevel;
    }
  } catch {
    dimensions = {};
  }
  return { overall: row.cefrLevel, dimensions };
}

export function placementScores(row: PlacementRow): TurnScores | null {
  if (row.vocabularyScore == null) return null;
  return {
    vocabulary: row.vocabularyScore,
    grammar: row.grammarScore ?? 0,
    fluency: row.fluencyScore ?? 0,
    cultural: row.culturalScore ?? 0,
    task: row.taskScore ?? 0,
    expressionAppropriateness: row.expressionAppropriatenessScore ?? 0,
  };
}
