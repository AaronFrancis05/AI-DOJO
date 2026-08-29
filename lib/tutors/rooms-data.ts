/**
 * Loaders and queue mechanics for the two group room types.
 *
 * The counterpart of `bookings.ts` for classes and assessments: every route
 * needs the same three answers — does it exist, is the caller party to it,
 * and are they the tutor. Collapsing "not found" and "not yours" into one
 * null is deliberate and matches `loadBookingForUser`: the API answers 404
 * for both, so a stranger cannot probe which ids exist.
 */

import { and, asc, eq, gt, sql } from 'drizzle-orm';
import { db } from '@/src/db';
import { dbPool } from '@/src/db-pool';
import {
  assessmentQueue,
  assessmentSessions,
  chatRoomMembers,
  classEnrollments,
  classSessions,
  tutors,
  users,
} from '@/src/schema';

/* ── Classes ─────────────────────────────────────────────────────────── */

export async function loadClassForUser(classId: number, userId: string) {
  const [row] = await db
    .select({
      classSession: classSessions,
      tutorUserId: tutors.userId,
      tutorName: users.name,
    })
    .from(classSessions)
    .innerJoin(tutors, eq(classSessions.tutorId, tutors.id))
    .innerJoin(users, eq(tutors.userId, users.id))
    .where(eq(classSessions.id, classId));

  if (!row) return null;

  const isTutor = row.tutorUserId === userId;

  const [enrollment] = await db
    .select()
    .from(classEnrollments)
    .where(and(
      eq(classEnrollments.classSessionId, classId),
      eq(classEnrollments.learnerId, userId),
    ))
    .limit(1);

  return { ...row, isTutor, enrollment: enrollment ?? null };
}

export type EnrolResult = { ok: true } | { ok: false; reason: string };

/**
 * Puts a learner on a class roster.
 *
 * Capacity is enforced inside a transaction under an advisory lock rather than
 * by a count-then-insert: two learners taking the last seat at the same moment
 * would both read the same count and both be admitted.
 *
 * Lives here rather than in the enrol route because joining an instant class
 * enrols on the way in — see the class token route. Two implementations of
 * "take a seat" would be two capacity rules, and only one of them would be the
 * one under the lock.
 */
export async function enrolLearner(
  classId: number,
  learnerId: string,
  classSession: { capacity: number; chatRoomId: number | null; instructionLanguage: string | null },
): Promise<EnrolResult> {
  return dbPool.transaction(async (tx): Promise<EnrolResult> => {
    // Namespaced away from the session lock the roleplay writer takes: both
    // use pg_advisory_xact_lock with a bare integer, and a class id colliding
    // with a session id would serialise two unrelated things.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${classId}, 1)`);

    const [{ taken }] = await tx
      .select({ taken: sql<number>`count(*)::int` })
      .from(classEnrollments)
      .where(and(
        eq(classEnrollments.classSessionId, classId),
        sql`${classEnrollments.status} <> 'cancelled'`,
      ));

    const [existing] = await tx
      .select()
      .from(classEnrollments)
      .where(and(
        eq(classEnrollments.classSessionId, classId),
        eq(classEnrollments.learnerId, learnerId),
      ))
      .limit(1);

    if (existing && existing.status !== 'cancelled') return { ok: true };
    if (Number(taken) >= classSession.capacity) {
      return { ok: false, reason: 'This class is full' };
    }

    await tx
      .insert(classEnrollments)
      .values({ classSessionId: classId, learnerId, status: 'enrolled' })
      .onConflictDoUpdate({
        target: [classEnrollments.classSessionId, classEnrollments.learnerId],
        set: { status: 'enrolled', enrolledAt: new Date() },
      });

    // The classroom's chat sidebar is a normal chat room, so enrolling has to
    // add the learner to it — otherwise the sidebar 403s inside the room.
    //
    // `preferredLanguage` is seeded from the class's instruction language, so
    // the sidebar arrives translated into the language the class is actually
    // taught in rather than each learner's own. Null leaves the column null,
    // which is the pre-existing behaviour: fall back to users.nativeLanguage.
    // The learner can still override it per room.
    if (classSession.chatRoomId) {
      await tx
        .insert(chatRoomMembers)
        .values({
          roomId: classSession.chatRoomId,
          userId: learnerId,
          preferredLanguage: classSession.instructionLanguage,
        })
        .onConflictDoNothing();
    }

    return { ok: true };
  });
}

/** Learners currently enrolled, for the roster and for notifications. */
export async function loadClassRoster(classId: number) {
  return db
    .select({
      learnerId: classEnrollments.learnerId,
      name: users.name,
      avatarSrc: users.avatarSrc,
      nativeLanguage: users.nativeLanguage,
      status: classEnrollments.status,
      enrolledAt: classEnrollments.enrolledAt,
    })
    .from(classEnrollments)
    .innerJoin(users, eq(classEnrollments.learnerId, users.id))
    .where(and(
      eq(classEnrollments.classSessionId, classId),
      sql`${classEnrollments.status} <> 'cancelled'`,
    ))
    .orderBy(asc(classEnrollments.enrolledAt));
}

/* ── Assessments ─────────────────────────────────────────────────────── */

export async function loadAssessmentForUser(assessmentId: number, userId: string) {
  const [row] = await db
    .select({
      assessment: assessmentSessions,
      tutorUserId: tutors.userId,
      tutorName: users.name,
      // The tutor's two language sets, so a caller changing the instruction
      // language can check it against what this tutor actually holds without a
      // second round trip. Shaped for tutorLanguageSets()/tutorLanguageError().
      tutor: {
        languages: tutors.languages,
        instructionLanguages: tutors.instructionLanguages,
      },
    })
    .from(assessmentSessions)
    .innerJoin(tutors, eq(assessmentSessions.tutorId, tutors.id))
    .innerJoin(users, eq(tutors.userId, users.id))
    .where(eq(assessmentSessions.id, assessmentId));

  if (!row) return null;

  const isTutor = row.tutorUserId === userId;

  const [slot] = await db
    .select()
    .from(assessmentQueue)
    .where(and(
      eq(assessmentQueue.assessmentId, assessmentId),
      eq(assessmentQueue.learnerId, userId),
    ))
    .limit(1);

  return { ...row, isTutor, slot: slot ?? null };
}

export interface QueueEntry {
  id: number;
  learnerId: string;
  name: string;
  avatarSrc: string | null;
  position: number;
  state: string;
  admittedAt: Date | null;
  completedAt: Date | null;
}

export async function loadQueue(assessmentId: number): Promise<QueueEntry[]> {
  return db
    .select({
      id: assessmentQueue.id,
      learnerId: assessmentQueue.learnerId,
      name: users.name,
      avatarSrc: users.avatarSrc,
      position: assessmentQueue.position,
      state: assessmentQueue.state,
      admittedAt: assessmentQueue.admittedAt,
      completedAt: assessmentQueue.completedAt,
    })
    .from(assessmentQueue)
    .innerJoin(users, eq(assessmentQueue.learnerId, users.id))
    .where(eq(assessmentQueue.assessmentId, assessmentId))
    .orderBy(asc(assessmentQueue.position));
}

/**
 * Adds a learner to the back of the queue, or returns their existing slot.
 *
 * Positions are dense and 1-based, which means the next one is
 * `max(position) + 1` — a value two concurrent joins would both compute the
 * same. The whole thing therefore runs inside a transaction holding an
 * advisory lock on the assessment, the same device the roleplay turn writer
 * uses (`withSessionLock`), so two learners pressing join at once cannot
 * take the same number.
 */
export async function joinQueue(assessmentId: number, learnerId: string) {
  return dbPool.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${assessmentId})`);

    const [existing] = await tx
      .select()
      .from(assessmentQueue)
      .where(and(
        eq(assessmentQueue.assessmentId, assessmentId),
        eq(assessmentQueue.learnerId, learnerId),
      ))
      .limit(1);
    if (existing) return existing;

    const [{ maxPosition }] = await tx
      .select({ maxPosition: sql<number>`coalesce(max(${assessmentQueue.position}), 0)` })
      .from(assessmentQueue)
      .where(eq(assessmentQueue.assessmentId, assessmentId));

    const [created] = await tx
      .insert(assessmentQueue)
      .values({
        assessmentId,
        learnerId,
        position: Number(maxPosition) + 1,
        state: 'waiting',
      })
      .returning();

    return created;
  });
}

/**
 * Removes a learner from the queue and closes the gap behind them.
 *
 * Renumbering rather than leaving a hole is what lets "you are 3rd" be read
 * straight off the row instead of counting, and keeps the estimate the
 * waiting screen shows honest.
 */
export async function leaveQueue(assessmentId: number, learnerId: string): Promise<boolean> {
  return dbPool.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${assessmentId})`);

    const [slot] = await tx
      .select()
      .from(assessmentQueue)
      .where(and(
        eq(assessmentQueue.assessmentId, assessmentId),
        eq(assessmentQueue.learnerId, learnerId),
      ))
      .limit(1);
    if (!slot) return false;

    await tx.delete(assessmentQueue).where(eq(assessmentQueue.id, slot.id));
    await tx
      .update(assessmentQueue)
      .set({ position: sql`${assessmentQueue.position} - 1` })
      .where(and(
        eq(assessmentQueue.assessmentId, assessmentId),
        gt(assessmentQueue.position, slot.position),
      ));

    return true;
  });
}

export type AdmitResult =
  | { ok: true; admittedLearnerId: string | null }
  | { ok: false; reason: string };

/**
 * Admits one learner into the room, ending whoever was in it.
 *
 * The rule the assessment room exists to enforce — exactly one learner in
 * the room at a time — lives here, in one transaction under the same
 * advisory lock, rather than in the UI. A tutor double-clicking "next" must
 * not put two learners in an exam together.
 *
 * @param learnerId admit this specific learner, or the next waiting one when null.
 */
export async function admitNext(
  assessmentId: number,
  learnerId: string | null,
): Promise<AdmitResult> {
  return dbPool.transaction(async (tx): Promise<AdmitResult> => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${assessmentId})`);

    const now = new Date();

    // Whoever is in the room is finished by the act of admitting the next
    // learner; there is no separate "done" press to forget.
    await tx
      .update(assessmentQueue)
      .set({ state: 'done', completedAt: now })
      .where(and(
        eq(assessmentQueue.assessmentId, assessmentId),
        eq(assessmentQueue.state, 'admitted'),
      ));

    const candidates = await tx
      .select()
      .from(assessmentQueue)
      .where(and(
        eq(assessmentQueue.assessmentId, assessmentId),
        eq(assessmentQueue.state, 'waiting'),
      ))
      .orderBy(asc(assessmentQueue.position));

    const next = learnerId
      ? candidates.find((c) => c.learnerId === learnerId)
      : candidates[0];

    if (!next) {
      return { ok: true, admittedLearnerId: null };
    }

    await tx
      .update(assessmentQueue)
      .set({ state: 'admitted', admittedAt: now })
      .where(eq(assessmentQueue.id, next.id));

    return { ok: true, admittedLearnerId: next.learnerId };
  });
}

/**
 * Whether an AI-examined assessment has nothing left to do.
 *
 * The AI examiner admits everyone at once and each learner sits their own
 * private interview, so there is no tutor in the room to press "end" — the
 * room has to notice for itself that the last transcript is in.
 *
 * The `done > 0` clause is load-bearing. Without it an assessment that goes
 * live with an empty queue is trivially "finished", and would close itself
 * before the first learner had even arrived.
 */
export async function assessmentQueueDrained(assessmentId: number): Promise<boolean> {
  const [counts] = await db
    .select({
      pending: sql<number>`count(*) filter (where ${assessmentQueue.state} in ('waiting', 'admitted'))::int`,
      done: sql<number>`count(*) filter (where ${assessmentQueue.state} = 'done')::int`,
    })
    .from(assessmentQueue)
    .where(eq(assessmentQueue.assessmentId, assessmentId));

  return Number(counts?.pending ?? 0) === 0 && Number(counts?.done ?? 0) > 0;
}

/** Marks the admitted learner done without pulling the next one in. */
export async function finishCurrent(assessmentId: number): Promise<void> {
  await db
    .update(assessmentQueue)
    .set({ state: 'done', completedAt: new Date() })
    .where(and(
      eq(assessmentQueue.assessmentId, assessmentId),
      eq(assessmentQueue.state, 'admitted'),
    ));
}
