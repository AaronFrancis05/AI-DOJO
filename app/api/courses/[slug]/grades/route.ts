import { and, desc, eq, inArray, isNotNull, or } from 'drizzle-orm';
import { db } from '@/src/db';
import {
  aiInterviews,
  assessmentQueue,
  assessmentSessions,
  courseLevels,
  courses,
  evaluations,
  lessons,
  sessions,
  tutorBookings,
  tutorEvaluations,
  tutors,
  units,
  users,
} from '@/src/schema';
import { getAuthUser } from '@/lib/auth/server';
import { computeCompositeScore } from '@/lib/roleplay/phase-engine';

export const runtime = 'nodejs';

/**
 * Grades for one course: the AI's verdict on each completed lesson, and the
 * human tutor verdicts that exist for this learner, side by side.
 *
 * `tutor_evaluations` is used as-is — it already scores the same six 0-100
 * dimensions the AI does, which is what `agreesWithAi` was designed to make
 * comparable. A tutor row is anchored either to a 1:1 booking or to an
 * assessment queue slot; both are resolved here so the page has one list.
 *
 * Three sources, then: the AI on each lesson, a human tutor, and the AI
 * examiner on a whole examination. The third is the only one where the two
 * verdicts are demonstrably about the *same* performance — tutor and machine
 * marking one transcript — so both sides carry `queueSlotId` and the page
 * pairs them on it.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { slug } = await params;

  const [course] = await db.select().from(courses).where(eq(courses.slug, slug)).limit(1);
  if (!course) return Response.json({ error: 'Course not found' }, { status: 404 });

  const targetLanguage =
    new URL(req.url).searchParams.get('target')?.trim() || null;

  // Every lesson in the course, so an AI evaluation can be attributed to the
  // lesson it came from rather than to a bare session id.
  const courseLessons = await db
    .select({
      lessonId: lessons.id,
      lessonTitle: lessons.title,
      unitId: units.id,
      unitTitle: units.title,
      lessonOrder: lessons.sequenceOrder,
      unitOrder: units.sequenceOrder,
      levelOrder: courseLevels.sequenceOrder,
    })
    .from(lessons)
    .innerJoin(units, eq(lessons.unitId, units.id))
    .innerJoin(courseLevels, eq(units.levelId, courseLevels.id))
    .where(eq(courseLevels.courseId, course.id));

  const lessonIds = courseLessons.map((l) => l.lessonId);
  const lessonById = new Map(courseLessons.map((l) => [l.lessonId, l]));

  // The AI's side. Joined through `sessions` because `evaluations` carries a
  // sessionId, not a lessonId.
  const aiRows = lessonIds.length
    ? await db
        .select({
          sessionId: evaluations.sessionId,
          lessonId: sessions.lessonId,
          targetLanguage: sessions.targetLanguage,
          vocabularyScore: evaluations.vocabularyScore,
          grammarScore: evaluations.grammarScore,
          fluencyScore: evaluations.fluencyScore,
          culturalScore: evaluations.culturalScore,
          taskScore: evaluations.taskScore,
          expressionAppropriatenessScore: evaluations.expressionAppropriatenessScore,
          feedback: evaluations.feedback,
          createdAt: evaluations.createdAt,
        })
        .from(evaluations)
        .innerJoin(sessions, eq(evaluations.sessionId, sessions.id))
        .where(and(
          eq(sessions.userId, user.id),
          isNotNull(sessions.lessonId),
          inArray(sessions.lessonId, lessonIds),
        ))
        .orderBy(desc(evaluations.createdAt))
    : [];

  const ai = aiRows
    .filter((r) => !targetLanguage || r.targetLanguage === targetLanguage)
    .map((r) => {
      const lesson = r.lessonId != null ? lessonById.get(r.lessonId) : undefined;
      return {
        sessionId: r.sessionId,
        lessonId: r.lessonId,
        lessonTitle: lesson?.lessonTitle ?? 'Lesson',
        unitId: lesson?.unitId ?? null,
        unitTitle: lesson?.unitTitle ?? null,
        scores: {
          vocabulary: r.vocabularyScore,
          grammar: r.grammarScore,
          fluency: r.fluencyScore,
          cultural: r.culturalScore,
          task: r.taskScore,
          expressionAppropriateness: r.expressionAppropriatenessScore,
        },
        composite: computeCompositeScore('evaluation', r),
        feedback: r.feedback,
        createdAt: r.createdAt,
      };
    });

  // The human side. Not filtered by course: a tutor grades a learner, not a
  // curriculum row, and hiding a verdict because it was given in a standalone
  // assessment would defeat the comparison this page exists for.
  const tutorRows = await db
    .select({
      evaluation: tutorEvaluations,
      tutorName: users.name,
      bookingScheduledAt: tutorBookings.scheduledAt,
      bookingPurpose: tutorBookings.purpose,
      assessmentTitle: assessmentSessions.title,
      assessmentScheduledAt: assessmentSessions.scheduledAt,
    })
    .from(tutorEvaluations)
    .innerJoin(tutors, eq(tutorEvaluations.tutorId, tutors.id))
    .innerJoin(users, eq(tutors.userId, users.id))
    .leftJoin(tutorBookings, eq(tutorEvaluations.bookingId, tutorBookings.id))
    .leftJoin(assessmentQueue, eq(tutorEvaluations.assessmentQueueId, assessmentQueue.id))
    .leftJoin(assessmentSessions, eq(assessmentQueue.assessmentId, assessmentSessions.id))
    .where(eq(tutorEvaluations.learnerId, user.id))
    .orderBy(desc(tutorEvaluations.createdAt))
    .limit(50);

  const tutorGrades = tutorRows.map(({ evaluation: t, ...rest }) => ({
    id: t.id,
    tutorName: rest.tutorName,
    source: t.assessmentQueueId != null ? ('assessment' as const) : ('booking' as const),
    title:
      rest.assessmentTitle ??
      (rest.bookingPurpose === 'evaluation' ? 'Evaluation session' : 'Tutor lesson'),
    occurredAt: rest.assessmentScheduledAt ?? rest.bookingScheduledAt ?? t.createdAt,
    sessionId: t.sessionId,
    scores: {
      vocabulary: t.vocabularyScore,
      grammar: t.grammarScore,
      fluency: t.fluencyScore,
      cultural: t.culturalScore,
      task: t.taskScore,
      expressionAppropriateness: t.expressionAppropriatenessScore,
    },
    composite: computeCompositeScore('evaluation', {
      vocabularyScore: t.vocabularyScore ?? 0,
      grammarScore: t.grammarScore ?? 0,
      fluencyScore: t.fluencyScore ?? 0,
      culturalScore: t.culturalScore ?? 0,
      taskScore: t.taskScore ?? 0,
      expressionAppropriatenessScore: t.expressionAppropriatenessScore ?? 0,
    }),
    agreesWithAi: t.agreesWithAi,
    notes: t.notes,
    createdAt: t.createdAt,
    // The anchor an AI examination is paired against below. Both this and
    // `ai_interviews.queue_slot_id` are unique, so at most one of each per slot.
    queueSlotId: t.assessmentQueueId,
  }));

  // Examinations sat with the AI examiner, when a tutor could not attend.
  // A third source rather than a row in either list above: it is neither a
  // lesson the AI marked nor a verdict a human gave, and folding it into
  // `tutor_evaluations` under the scheduling tutor's name would have made
  // `agreesWithAi` meaningless. Unfiltered by course for the same reason the
  // tutor verdicts are.
  const interviewRows = await db
    .select({ interview: aiInterviews, assessmentTitle: assessmentSessions.title })
    .from(aiInterviews)
    .innerJoin(assessmentSessions, eq(aiInterviews.assessmentId, assessmentSessions.id))
    .where(and(eq(aiInterviews.learnerId, user.id), isNotNull(aiInterviews.gradedAt)))
    .orderBy(desc(aiInterviews.endedAt))
    .limit(50);

  const interviewGrades = interviewRows.map(({ interview: i, assessmentTitle }) => ({
    id: i.id,
    title: assessmentTitle,
    queueSlotId: i.queueSlotId,
    targetLanguage: i.targetLanguage,
    occurredAt: i.endedAt ?? i.createdAt,
    learnerTurns: i.learnerTurns,
    scores: {
      vocabulary: i.vocabularyScore,
      grammar: i.grammarScore,
      fluency: i.fluencyScore,
      cultural: i.culturalScore,
      task: i.taskScore,
      expressionAppropriateness: i.expressionAppropriatenessScore,
    },
    composite: computeCompositeScore('evaluation', {
      vocabularyScore: i.vocabularyScore ?? 0,
      grammarScore: i.grammarScore ?? 0,
      fluencyScore: i.fluencyScore ?? 0,
      culturalScore: i.culturalScore ?? 0,
      taskScore: i.taskScore ?? 0,
      expressionAppropriatenessScore: i.expressionAppropriatenessScore ?? 0,
    }),
    feedback: i.feedback,
  }));

  return Response.json({
    success: true,
    course: { id: course.id, slug: course.slug, title: course.title },
    aiGrades: ai,
    tutorGrades,
    interviewGrades,
  });
}
