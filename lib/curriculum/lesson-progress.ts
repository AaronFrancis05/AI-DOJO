import { db } from '@/src/db';
import { courses, lessons, units, courseLevels, lessonPhases, vocabulary, studentLessonProgress, studentProgress, srsCards } from '@/src/schema';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';

export const LESSON_COMPLETION_XP = 50;

/**
 * Where a learner goes after finishing a curriculum lesson.
 *
 * The course page walks levels → units → lessons into one linear list and
 * locks everything after the first lesson that isn't `completed`. Session
 * completion needs the same answer, so the walk lives here rather than being
 * re-implemented — two definitions of "unlocked" is exactly how a learner
 * ends up being sent to a lesson the page then shows as locked.
 */
export interface NextLessonTarget {
  courseSlug: string;
  unitId: number;
  unitTitle: string;
  /** Null when this was the last lesson of the course. */
  nextLessonId: number | null;
  nextLessonTitle: string | null;
  /** Every lesson in the just-finished lesson's unit is now complete. */
  unitCompleted: boolean;
  /** …and so is every unit in its level. */
  levelCompleted: boolean;
}

export async function resolveNextLesson(
  userId: string,
  lessonId: number,
  targetLanguage: string,
): Promise<NextLessonTarget | null> {
  const [lesson] = await db.select().from(lessons).where(eq(lessons.id, lessonId));
  if (!lesson) return null;

  const [unit] = await db.select().from(units).where(eq(units.id, lesson.unitId));
  if (!unit) return null;

  const [level] = await db.select().from(courseLevels).where(eq(courseLevels.id, unit.levelId));
  if (!level) return null;

  const [course] = await db.select().from(courses).where(eq(courses.id, level.courseId));
  if (!course) return null;

  // The whole course, flattened in the same order the course page renders it.
  const levelRows = await db
    .select()
    .from(courseLevels)
    .where(eq(courseLevels.courseId, course.id))
    .orderBy(asc(courseLevels.sequenceOrder));

  const unitRows = await db
    .select()
    .from(units)
    .where(inArray(units.levelId, levelRows.map((l) => l.id)))
    .orderBy(asc(units.sequenceOrder));

  const lessonRows = await db
    .select()
    .from(lessons)
    .where(and(
      inArray(lessons.unitId, unitRows.map((u) => u.id)),
      eq(lessons.isActive, true),
    ))
    .orderBy(asc(lessons.sequenceOrder));

  const flat = levelRows.flatMap((lvl) =>
    unitRows
      .filter((u) => u.levelId === lvl.id)
      .flatMap((u) => lessonRows.filter((l) => l.unitId === u.id)),
  );

  const progressRows = await db
    .select({ lessonId: studentLessonProgress.lessonId, status: studentLessonProgress.status })
    .from(studentLessonProgress)
    .where(and(
      eq(studentLessonProgress.userId, userId),
      eq(studentLessonProgress.targetLanguage, targetLanguage),
    ));
  const completedIds = new Set(
    progressRows.filter((p) => p.status === 'completed').map((p) => p.lessonId),
  );

  // The next lesson is the first one still not completed — not simply the one
  // after this in sequence, so replaying an old lesson doesn't send the
  // learner backwards through the course.
  const next = flat.find((l) => !completedIds.has(l.id)) ?? null;

  const unitLessonIds = flat.filter((l) => l.unitId === unit.id).map((l) => l.id);
  const unitCompleted = unitLessonIds.every((id) => completedIds.has(id));

  const levelUnitIds = unitRows.filter((u) => u.levelId === level.id).map((u) => u.id);
  const levelCompleted = flat
    .filter((l) => levelUnitIds.includes(l.unitId))
    .every((l) => completedIds.has(l.id));

  return {
    courseSlug: course.slug,
    unitId: unit.id,
    unitTitle: unit.title,
    nextLessonId: next?.id ?? null,
    nextLessonTitle: next?.title ?? null,
    unitCompleted,
    levelCompleted,
  };
}

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
