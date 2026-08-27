/**
 * Who a tutor's announcement or cohort room reaches.
 *
 * One module so "my learners" means the same thing everywhere: the
 * announcement fan-out, the cohort room's membership, and the recipient count
 * the console shows before sending are all this function. A second definition
 * would let the preview disagree with the delivery.
 *
 * Every audience is scoped to the calling tutor's own rows — a tutor can only
 * ever reach learners they actually teach.
 */

import { and, eq, inArray, ne } from 'drizzle-orm';
import { db } from '@/src/db';
import {
  assessmentQueue,
  assessmentSessions,
  classEnrollments,
  classSessions,
  studentProgress,
  tutorBookings,
  tutors,
  users,
} from '@/src/schema';
import { tutorLanguageSets } from '@/lib/tutors/languages';

export const AUDIENCE_KINDS = ['class', 'course', 'all_my_learners'] as const;
export type AudienceKind = (typeof AUDIENCE_KINDS)[number];

export function isAudienceKind(value: unknown): value is AudienceKind {
  return typeof value === 'string' && (AUDIENCE_KINDS as readonly string[]).includes(value);
}

export interface AudienceScope {
  /** Required for `class`. Must belong to this tutor. */
  classSessionId?: number | null;
  /** Required for `course`. */
  courseId?: number | null;
  /** Narrows `course` to one target language. */
  targetLanguage?: string | null;
}

export interface ResolvedAudience {
  learnerIds: string[];
  /** Set when the scope was unusable — a class that is not this tutor's, say. */
  error: string | null;
}

/**
 * Only accounts that can actually receive something.
 *
 * A suspended or soft-deleted learner still has rows in `class_enrollments`
 * and `student_progress` — that is the point of not hard-deleting them — but
 * notifying them, or adding them to a new chat room, would be wrong.
 */
async function activeLearners(ids: string[]): Promise<string[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];

  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.id, unique), eq(users.status, 'active')));

  return rows.map((r) => r.id);
}

export async function resolveAudience(
  tutorId: number,
  kind: AudienceKind,
  scope: AudienceScope = {},
): Promise<ResolvedAudience> {
  if (kind === 'class') {
    const classSessionId = scope.classSessionId;
    if (!classSessionId || !Number.isInteger(classSessionId)) {
      return { learnerIds: [], error: 'Pick a class.' };
    }

    // The ownership check is the join, not a separate read: a class id that is
    // not this tutor's simply yields no rows, so it cannot be used to probe
    // another tutor's roster either.
    const rows = await db
      .select({ learnerId: classEnrollments.learnerId })
      .from(classEnrollments)
      .innerJoin(classSessions, eq(classEnrollments.classSessionId, classSessions.id))
      .where(and(
        eq(classEnrollments.classSessionId, classSessionId),
        eq(classSessions.tutorId, tutorId),
        ne(classEnrollments.status, 'cancelled'),
      ));

    return { learnerIds: await activeLearners(rows.map((r) => r.learnerId)), error: null };
  }

  if (kind === 'course') {
    const courseId = scope.courseId;
    if (!courseId || !Number.isInteger(courseId)) {
      return { learnerIds: [], error: 'Pick a course.' };
    }

    // Enrolment is per (learner, course, target language), so a tutor
    // announcing to "the Japanese course" must not reach the French cohort of
    // the same course. With no language given it is every language this tutor
    // teaches — never every language, which would be someone else's learners.
    const teaches = await tutorTeaches(tutorId);
    const languages = scope.targetLanguage
      ? teaches.filter((code) => code === scope.targetLanguage)
      : teaches;

    if (languages.length === 0) {
      return {
        learnerIds: [],
        error: scope.targetLanguage
          ? `You are not listed as teaching ${scope.targetLanguage}.`
          : 'Your profile lists no teaching languages.',
      };
    }

    // Enrolment in a course says nothing about who teaches the learner: this
    // table is the whole platform's, not this tutor's. Without the second half
    // a tutor announcing to "the Japanese course" reached every learner on it,
    // including strangers, and the cohort room added them to a group chat.
    // Intersect with the learners this tutor actually teaches.
    const own = new Set(await tutorOwnLearnerIds(tutorId));
    if (own.size === 0) return { learnerIds: [], error: null };

    const rows = await db
      .select({ learnerId: studentProgress.userId })
      .from(studentProgress)
      .where(and(
        eq(studentProgress.courseId, courseId),
        inArray(studentProgress.targetLanguage, languages),
        inArray(studentProgress.userId, [...own]),
      ));

    return { learnerIds: await activeLearners(rows.map((r) => r.learnerId)), error: null };
  }

  // all_my_learners
  return { learnerIds: await activeLearners(await tutorOwnLearnerIds(tutorId)), error: null };
}

/**
 * Every learner this tutor has actually taught — the union of the three ways
 * that can be true: a class they ran, a booking they took, an assessment they
 * examined. Not filtered for account status; `activeLearners` does that.
 *
 * Three separate queries rather than one UNION so each stays a plain indexed
 * lookup on its own table; the sets are small and merged here.
 */
async function tutorOwnLearnerIds(tutorId: number): Promise<string[]> {
  const [classRows, bookingRows, assessmentRows] = await Promise.all([
    db
      .select({ learnerId: classEnrollments.learnerId })
      .from(classEnrollments)
      .innerJoin(classSessions, eq(classEnrollments.classSessionId, classSessions.id))
      .where(and(
        eq(classSessions.tutorId, tutorId),
        ne(classEnrollments.status, 'cancelled'),
      )),
    db
      .select({ learnerId: tutorBookings.learnerId })
      .from(tutorBookings)
      .where(and(
        eq(tutorBookings.tutorId, tutorId),
        ne(tutorBookings.status, 'cancelled'),
      )),
    db
      .select({ learnerId: assessmentQueue.learnerId })
      .from(assessmentQueue)
      .innerJoin(assessmentSessions, eq(assessmentQueue.assessmentId, assessmentSessions.id))
      .where(eq(assessmentSessions.tutorId, tutorId)),
  ]);

  return [...new Set([
    ...classRows.map((r) => r.learnerId),
    ...bookingRows.map((r) => r.learnerId),
    ...assessmentRows.map((r) => r.learnerId),
  ])];
}

/** The target languages on a tutor's profile. */
async function tutorTeaches(tutorId: number): Promise<string[]> {
  const [row] = await db
    .select({
      languages: tutors.languages,
      instructionLanguages: tutors.instructionLanguages,
    })
    .from(tutors)
    .where(eq(tutors.id, tutorId))
    .limit(1);

  return row ? tutorLanguageSets(row).teaches : [];
}
