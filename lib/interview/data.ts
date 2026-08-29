/**
 * Reading and writing `ai_interviews`.
 *
 * The counterpart of `lib/tutors/rooms-data.ts` for the AI examiner. Kept
 * here rather than added to that file because the queue mechanics there
 * enforce a rule this feature deliberately does not have: with a human
 * examiner exactly one learner is in the room at a time, and `admitNext`
 * ends the previous learner's turn to guarantee it. An AI examiner gives
 * every learner their own private session, so they all run at once and
 * `admitNext`/`finishCurrent` must never be called on an AI assessment (the
 * queue route refuses them).
 *
 * The queue slot is still used, and still means something: `waiting` = signed
 * up, `admitted` = interview in progress, `done` = interview finished. That
 * keeps one roster shape across both kinds of assessment, and gives the
 * evaluation a slot to anchor to if the tutor later files their own verdict.
 */

import { and, asc, desc, eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { db } from '@/src/db';
import { dbPool } from '@/src/db-pool';
import { aiInterviews, assessmentQueue, assessmentSessions, users } from '@/src/schema';
import type { TurnScores } from '@/lib/ai-engine';
import type { InterviewTurn } from './transcript';

export type AiInterviewRow = typeof aiInterviews.$inferSelect;

export interface StartInterviewInput {
  assessmentId: number;
  learnerId: string;
  targetLanguage: string;
  model: string;
}

export type StartInterviewResult =
  | { ok: true; interview: AiInterviewRow; resumed: boolean }
  // `interview` is null when the refusal is about the room rather than the
  // learner's own attempt — a closed assessment has no interview to hand back.
  | { ok: false; reason: string; interview: AiInterviewRow | null };

/**
 * Takes the learner's queue slot and the interview row for it, creating both
 * if this is the first time.
 *
 * One transaction under the same advisory lock `joinQueue` takes, for the
 * same reason: `max(position) + 1` is a value two concurrent starts would
 * both compute identically.
 *
 * Re-entrant while the interview has not been submitted. A learner whose
 * laptop slept mid-interview gets their session back rather than losing their
 * one attempt; `startedAt` is stamped once, so the record still shows when
 * they actually began. Once the row is `completed` it is closed for good —
 * that is where "one attempt" is enforced, NOT on the token's `uses` field,
 * which was observed not to refuse a second connection.
 */
export async function startInterview(
  input: StartInterviewInput,
): Promise<StartInterviewResult> {
  const { assessmentId, learnerId, targetLanguage, model } = input;

  return dbPool.transaction(async (tx): Promise<StartInterviewResult> => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${assessmentId})`);

    // Re-read the room under the lock. The caller checked the join window
    // before getting here, but between that check and this transaction the
    // last learner in the queue can have submitted — and the auto-close takes
    // this same lock to end the room. Without this, that race admits someone
    // into an assessment that has just finished, and their interview belongs
    // to a completed session nobody will look at.
    //
    // Closed, not "not live": a scheduled AI assessment inside its join window
    // has never been PATCHed live, and refusing it would break the ordinary
    // case that `canJoinBooking` already allows.
    const [room] = await tx
      .select({ status: assessmentSessions.status })
      .from(assessmentSessions)
      .where(eq(assessmentSessions.id, assessmentId))
      .limit(1);

    if (!room || room.status === 'completed' || room.status === 'cancelled') {
      return {
        ok: false,
        reason: 'This assessment has closed.',
        interview: null,
      };
    }

    const now = new Date();

    let [slot] = await tx
      .select()
      .from(assessmentQueue)
      .where(and(
        eq(assessmentQueue.assessmentId, assessmentId),
        eq(assessmentQueue.learnerId, learnerId),
      ))
      .limit(1);

    if (!slot) {
      const [{ maxPosition }] = await tx
        .select({ maxPosition: sql<number>`coalesce(max(${assessmentQueue.position}), 0)` })
        .from(assessmentQueue)
        .where(eq(assessmentQueue.assessmentId, assessmentId));

      [slot] = await tx
        .insert(assessmentQueue)
        .values({
          assessmentId,
          learnerId,
          position: Number(maxPosition) + 1,
          // Admitted on the spot: there is no line for a private session, and
          // nobody to press "admit".
          state: 'admitted',
          admittedAt: now,
        })
        .returning();
    }

    const [existing] = await tx
      .select()
      .from(aiInterviews)
      .where(eq(aiInterviews.queueSlotId, slot.id))
      .limit(1);

    if (existing) {
      if (existing.status === 'completed') {
        return { ok: false, reason: 'You have already taken this assessment.', interview: existing };
      }

      const [resumed] = await tx
        .update(aiInterviews)
        .set({
          status: 'live',
          startedAt: existing.startedAt ?? now,
          model,
          updatedAt: now,
        })
        .where(eq(aiInterviews.id, existing.id))
        .returning();

      if (slot.state === 'waiting') {
        await tx
          .update(assessmentQueue)
          .set({ state: 'admitted', admittedAt: slot.admittedAt ?? now })
          .where(eq(assessmentQueue.id, slot.id));
      }

      return { ok: true, interview: resumed, resumed: existing.startedAt != null };
    }

    const [created] = await tx
      .insert(aiInterviews)
      .values({
        queueSlotId: slot.id,
        assessmentId,
        learnerId,
        targetLanguage,
        model,
        status: 'live',
        startedAt: now,
      })
      .returning();

    if (slot.state === 'waiting') {
      await tx
        .update(assessmentQueue)
        .set({ state: 'admitted', admittedAt: now })
        .where(eq(assessmentQueue.id, slot.id));
    }

    return { ok: true, interview: created, resumed: false };
  });
}

export interface CompleteInterviewInput {
  interviewId: number;
  turns: InterviewTurn[];
  learnerTurns: number;
  scores: TurnScores | null;
  feedback: string | null;
  /** 'completed' when it was graded, 'failed' when grading could not run. */
  status: 'completed' | 'failed';
}

/**
 * Files the finished interview and closes the learner's queue slot.
 *
 * The slot moves to `done` in the same statement batch, so a completed
 * interview and a still-open slot cannot disagree on the tutor's roster.
 */
export async function completeInterview(input: CompleteInterviewInput): Promise<AiInterviewRow | null> {
  const { interviewId, turns, learnerTurns, scores, feedback, status } = input;
  const now = new Date();

  const [saved] = await db
    .update(aiInterviews)
    .set({
      status,
      endedAt: now,
      learnerTurns,
      transcript: JSON.stringify(turns),
      vocabularyScore: scores?.vocabulary ?? null,
      grammarScore: scores?.grammar ?? null,
      fluencyScore: scores?.fluency ?? null,
      culturalScore: scores?.cultural ?? null,
      taskScore: scores?.task ?? null,
      expressionAppropriatenessScore: scores?.expressionAppropriateness ?? null,
      feedback,
      gradedAt: scores ? now : null,
      updatedAt: now,
    })
    .where(eq(aiInterviews.id, interviewId))
    .returning();

  if (saved) {
    await db
      .update(assessmentQueue)
      .set({ state: 'done', completedAt: now })
      .where(eq(assessmentQueue.id, saved.queueSlotId));
  }

  return saved ?? null;
}

/** Marks an in-flight interview failed without a transcript to show for it. */
export async function failInterview(interviewId: number): Promise<void> {
  const now = new Date();
  await db
    .update(aiInterviews)
    .set({ status: 'failed', endedAt: now, updatedAt: now })
    .where(eq(aiInterviews.id, interviewId));
}

export async function loadInterviewForLearner(
  assessmentId: number,
  learnerId: string,
): Promise<AiInterviewRow | null> {
  const [row] = await db
    .select()
    .from(aiInterviews)
    .where(and(
      eq(aiInterviews.assessmentId, assessmentId),
      eq(aiInterviews.learnerId, learnerId),
    ))
    .limit(1);
  return row ?? null;
}

export async function loadInterviewById(interviewId: number): Promise<AiInterviewRow | null> {
  const [row] = await db
    .select()
    .from(aiInterviews)
    .where(eq(aiInterviews.id, interviewId))
    .limit(1);
  return row ?? null;
}

export interface InterviewSummary {
  id: number;
  learnerId: string;
  learnerName: string;
  avatarSrc: string | null;
  status: string;
  startedAt: Date | null;
  endedAt: Date | null;
  learnerTurns: number;
  scores: TurnScores | null;
  feedback: string | null;
}

function rowScores(row: AiInterviewRow): TurnScores | null {
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

export { rowScores as interviewScores };

/** Every learner's interview for one assessment — the tutor's results list. */
export async function loadInterviewsForAssessment(
  assessmentId: number,
): Promise<InterviewSummary[]> {
  const rows = await db
    .select({ interview: aiInterviews, name: users.name, avatarSrc: users.avatarSrc })
    .from(aiInterviews)
    .innerJoin(users, eq(aiInterviews.learnerId, users.id))
    .where(eq(aiInterviews.assessmentId, assessmentId))
    .orderBy(desc(aiInterviews.endedAt), asc(aiInterviews.id));

  return rows.map(({ interview, name, avatarSrc }) => ({
    id: interview.id,
    learnerId: interview.learnerId,
    learnerName: name,
    avatarSrc,
    status: interview.status,
    startedAt: interview.startedAt,
    endedAt: interview.endedAt,
    learnerTurns: interview.learnerTurns,
    scores: rowScores(interview),
    feedback: interview.feedback,
  }));
}
