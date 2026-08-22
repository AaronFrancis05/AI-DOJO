import { db } from '@/src/db';
import { lessons, units, courseLevels, lessonPhases, vocabulary, studentLessonProgress, studentProgress, srsCards } from '@/src/schema';
import { eq, sql } from 'drizzle-orm';

export const LESSON_COMPLETION_XP = 50;

interface RecordLessonActivityInput {
  userId: string;
  lessonId: number;
  phaseKey?: string | null;
  complete?: boolean;
  score?: number | null;
  targetLanguage?: string;
  nativeLanguage?: string;
}

/**
 * Records a user's activity on a lesson:
 *  - upserts student_lesson_progress (active/completed)
 *  - updates the course-level student_progress snapshot (current lesson, XP, lessons completed)
 *  - on completion, seeds SRS cards from the lesson's scenario vocabulary
 * Progress is tracked per (course, targetLanguage) since a course is a
 * language-neutral template.
 */
export async function recordLessonActivity({
  userId,
  lessonId,
  phaseKey = null,
  complete = false,
  score = null,
  targetLanguage = 'ja',
  nativeLanguage = 'en',
}: RecordLessonActivityInput) {
  const [lesson] = await db.select().from(lessons).where(eq(lessons.id, lessonId));
  if (!lesson) {
    throw new Error('Lesson not found');
  }

  const [unit] = lesson.unitId
    ? await db.select().from(units).where(eq(units.id, lesson.unitId))
    : [null];
  const [level] = unit?.levelId
    ? await db.select().from(courseLevels).where(eq(courseLevels.id, unit.levelId))
    : [null];

  const phaseRows = await db
    .select()
    .from(lessonPhases)
    .where(eq(lessonPhases.lessonId, lesson.id))
    .orderBy(lessonPhases.sequenceOrder);

  const now = new Date();

  const [existingLessonProgress] = await db
    .select()
    .from(studentLessonProgress)
    .where(sql`${studentLessonProgress.userId} = ${userId} AND ${studentLessonProgress.lessonId} = ${lesson.id} AND ${studentLessonProgress.targetLanguage} = ${targetLanguage}`)
    .limit(1);

  const completedPhases = complete
    ? JSON.stringify(phaseRows.map((p) => p.phaseKey))
    : null;
  const bestScore = existingLessonProgress
    ? Math.max(existingLessonProgress.bestScore ?? 0, score ?? 0)
    : (score ?? null);
  const attempts = (existingLessonProgress?.attempts ?? 0) + 1;
  // A retry of an already-completed lesson must not re-award XP or
  // re-count toward the course's lessonsCompleted total.
  const isFirstCompletion = complete && existingLessonProgress?.status !== 'completed';
  // Replaying an already-completed lesson (e.g. "Try Again" with different
  // language settings) must not move the course's current-position pointer
  // backwards to this lesson.
  const isReplay = existingLessonProgress?.status === 'completed';

  const [lessonProgressRow] = await db
    .insert(studentLessonProgress)
    .values({
      userId,
      lessonId: lesson.id,
      targetLanguage,
      status: complete ? 'completed' : 'active',
      currentPhaseKey: complete ? (phaseRows[phaseRows.length - 1]?.phaseKey ?? null) : phaseKey,
      completedPhases,
      score: complete ? score : null,
      bestScore,
      attempts,
      lastActivityAt: now,
      completedAt: complete ? now : null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [studentLessonProgress.userId, studentLessonProgress.lessonId, studentLessonProgress.targetLanguage],
      set: {
        status: complete ? 'completed' : 'active',
        currentPhaseKey: complete ? (phaseRows[phaseRows.length - 1]?.phaseKey ?? null) : phaseKey,
        completedPhases,
        score: complete ? score : null,
        bestScore,
        attempts,
        lastActivityAt: now,
        completedAt: complete ? now : null,
        updatedAt: now,
      },
    })
    .returning();

  if (level) {
    await db
      .insert(studentProgress)
      .values({
        userId,
        courseId: level.courseId,
        targetLanguage,
        nativeLanguage,
        currentLevelId: unit?.levelId ?? null,
        currentUnitId: lesson.unitId,
        currentLessonId: lesson.id,
        currentPhaseKey: phaseKey,
        lessonsCompleted: isFirstCompletion ? 1 : 0,
        xpEarned: isFirstCompletion ? LESSON_COMPLETION_XP : 0,
        status: 'in_progress',
        lastActivityAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [studentProgress.userId, studentProgress.courseId, studentProgress.targetLanguage],
        set: {
          currentLevelId: isReplay ? studentProgress.currentLevelId : (unit?.levelId ?? null),
          currentUnitId: isReplay ? studentProgress.currentUnitId : lesson.unitId,
          currentLessonId: isReplay ? studentProgress.currentLessonId : lesson.id,
          currentPhaseKey: isReplay ? studentProgress.currentPhaseKey : phaseKey,
          lessonsCompleted: isFirstCompletion
            ? sql`${studentProgress.lessonsCompleted} + 1`
            : studentProgress.lessonsCompleted,
          xpEarned: isFirstCompletion
            ? sql`${studentProgress.xpEarned} + ${LESSON_COMPLETION_XP}`
            : studentProgress.xpEarned,
          status: 'in_progress',
          lastActivityAt: now,
          updatedAt: now,
        },
      });
  }

  let seededSrsCards = 0;
  if (complete && lesson.scenarioId) {
    const vocabRows = await db
      .select({ id: vocabulary.id })
      .from(vocabulary)
      .where(eq(vocabulary.scenarioId, lesson.scenarioId));

    if (vocabRows.length > 0) {
      const inserted = await db
        .insert(srsCards)
        .values(vocabRows.map((v) => ({ userId, vocabularyId: v.id })))
        .onConflictDoNothing()
        .returning({ id: srsCards.id });
      seededSrsCards = inserted.length;
    }
  }

  return { lessonProgress: lessonProgressRow, seededSrsCards };
}
