import { getAuthUser } from '@/lib/auth/server';
import { db } from '@/src/db';
import { learnerWeakPoints, scenarios, sessions, studyPacks, tutorBookings, tutors, users } from '@/src/schema';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { STUDY_PACKS_ENABLED } from '@/lib/study-packs/config';
import { scenarioTitleForLearner } from '@/lib/study-packs/server';
import { DEFAULT_TARGET_LANGUAGE } from '@/lib/language';

const LIST_LIMIT = 30;

/** The tutor's account row, for a lesson pack's title (PLAN.md 4.2). */
const tutorUsers = alias(users, 'tutor_users');
const WEAK_POINT_LIMIT = 8;

/**
 * The learner's study packs, newest first, with their open weak points.
 *
 * `?sessionId=` instead answers "is this session's pack ready yet?" for the
 * session report page, which polls it while the job runs.
 */
export async function GET(req: Request) {
  if (!STUDY_PACKS_ENABLED) return Response.json({ error: 'Not found' }, { status: 404 });
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const sessionParam = new URL(req.url).searchParams.get('sessionId');
  if (sessionParam !== null) {
    const sessionId = Number(sessionParam);
    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      return Response.json({ error: 'Invalid sessionId' }, { status: 400 });
    }
    const [pack] = await db
      .select({ id: studyPacks.id, status: studyPacks.status })
      .from(studyPacks)
      .where(and(eq(studyPacks.sessionId, sessionId), eq(studyPacks.userId, user.id)))
      .limit(1);
    return Response.json({ success: true, pack: pack ?? null });
  }

  const [profile] = await db
    .select({ targetLanguage: users.preferredTargetLanguage })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  const targetLanguage = profile?.targetLanguage ?? DEFAULT_TARGET_LANGUAGE;

  const [packRows, weakPoints] = await Promise.all([
    db
      .select({
        id: studyPacks.id,
        sessionId: studyPacks.sessionId,
        status: studyPacks.status,
        createdAt: studyPacks.createdAt,
        targetLanguage: studyPacks.targetLanguage,
        nativeLanguage: studyPacks.nativeLanguage,
        scenarioId: scenarios.id,
        scenarioTitle: scenarios.title,
        bookingId: studyPacks.bookingId,
        tutorName: tutorUsers.name,
      })
      .from(studyPacks)
      // A pack comes from a session or, since Phase 4, from a tutor lesson.
      .leftJoin(sessions, eq(studyPacks.sessionId, sessions.id))
      .leftJoin(scenarios, eq(sessions.scenarioId, scenarios.id))
      .leftJoin(tutorBookings, eq(studyPacks.bookingId, tutorBookings.id))
      .leftJoin(tutors, eq(tutorBookings.tutorId, tutors.id))
      .leftJoin(tutorUsers, eq(tutors.userId, tutorUsers.id))
      .where(eq(studyPacks.userId, user.id))
      .orderBy(desc(studyPacks.createdAt))
      .limit(LIST_LIMIT),
    db
      .select({
        id: learnerWeakPoints.id,
        category: learnerWeakPoints.category,
        pattern: learnerWeakPoints.pattern,
        example: learnerWeakPoints.example,
        count: learnerWeakPoints.count,
      })
      .from(learnerWeakPoints)
      .where(and(
        eq(learnerWeakPoints.userId, user.id),
        eq(learnerWeakPoints.targetLanguage, targetLanguage),
        isNull(learnerWeakPoints.resolvedAt),
      ))
      .orderBy(desc(learnerWeakPoints.count), desc(learnerWeakPoints.lastSeenAt))
      .limit(WEAK_POINT_LIMIT),
  ]);

  const packs = await Promise.all(packRows.map(async (p) => ({
    id: p.id,
    sessionId: p.sessionId,
    bookingId: p.bookingId,
    status: p.status,
    createdAt: p.createdAt,
    scenarioTitle: p.scenarioId !== null && p.scenarioTitle !== null
      ? await scenarioTitleForLearner(
        { id: p.scenarioId, title: p.scenarioTitle },
        p.targetLanguage,
        p.nativeLanguage,
      )
      : `Lesson with ${p.tutorName ?? 'your tutor'}`,
  })));

  return Response.json({ success: true, packs, weakPoints });
}
