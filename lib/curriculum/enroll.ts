import { db } from '@/src/db';
import { courses, courseLevels, lessons, studentProgress, units } from '@/src/schema';
import { and, asc, eq, inArray } from 'drizzle-orm';

/**
 * Enrolling a freshly-onboarded learner into the course curriculum.
 *
 * Onboarding already wrote the learner's preferences onto `users`, but
 * nothing ever created the `student_progress` row those preferences imply, so
 * a new account landed on /home with no path to follow and the course page
 * showed it as never started. This is the missing half.
 *
 * A course is a LANGUAGE-AGNOSTIC template (see the comment above `courses`
 * in src/schema.ts) — the target language lives on the enrolment, not the
 * course — so "the course for this language and level" resolves by
 * difficulty, with the first active course as the fallback rather than
 * leaving the learner unenrolled.
 */
export interface EnrollmentTarget {
  courseId: number;
  courseSlug: string;
  courseTitle: string;
  /** True when this call created the enrolment rather than finding one. */
  created: boolean;
}

interface EnrollInCourseInput {
  userId: string;
  /** `users.level` — 'beginner' | 'intermediate' | 'advanced'. */
  level: string;
  targetLanguage: string;
  nativeLanguage: string;
}

export async function enrollInCourse({
  userId,
  level,
  targetLanguage,
  nativeLanguage,
}: EnrollInCourseInput): Promise<EnrollmentTarget | null> {
  const activeCourses = await db
    .select()
    .from(courses)
    .where(eq(courses.isActive, true))
    .orderBy(asc(courses.displayOrder), asc(courses.id));

  if (activeCourses.length === 0) return null;

  const course = activeCourses.find((c) => c.difficulty === level) ?? activeCourses[0];

  // The course's first lesson, walked in the same order the course page
  // renders it, so the enrolment's "current" pointer agrees with the first
  // unlocked lesson the learner will actually be shown.
  const levelRows = await db
    .select()
    .from(courseLevels)
    .where(and(eq(courseLevels.courseId, course.id), eq(courseLevels.isActive, true)))
    .orderBy(asc(courseLevels.sequenceOrder));

  const unitRows = levelRows.length
    ? await db
        .select()
        .from(units)
        .where(inArray(units.levelId, levelRows.map((l) => l.id)))
        .orderBy(asc(units.sequenceOrder))
    : [];

  const lessonRows = unitRows.length
    ? await db
        .select()
        .from(lessons)
        .where(and(inArray(lessons.unitId, unitRows.map((u) => u.id)), eq(lessons.isActive, true)))
        .orderBy(asc(lessons.sequenceOrder))
    : [];

  const firstUnit = levelRows.length
    ? unitRows.find((u) => u.levelId === levelRows[0].id) ?? null
    : null;
  const firstLesson = firstUnit ? lessonRows.find((l) => l.unitId === firstUnit.id) ?? null : null;

  // `onConflictDoNothing`, not an upsert: re-running onboarding (or a second
  // OAuth bounce through the account step) must never reset a learner who has
  // already made progress on this course back to lesson one.
  const inserted = await db
    .insert(studentProgress)
    .values({
      userId,
      courseId: course.id,
      targetLanguage,
      nativeLanguage,
      currentLevelId: levelRows[0]?.id ?? null,
      currentUnitId: firstUnit?.id ?? null,
      currentLessonId: firstLesson?.id ?? null,
      currentPhaseKey: null,
      status: 'not_started',
      lastActivityAt: null,
    })
    .onConflictDoNothing({
      target: [studentProgress.userId, studentProgress.courseId, studentProgress.targetLanguage],
    })
    .returning({ id: studentProgress.id });

  return {
    courseId: course.id,
    courseSlug: course.slug,
    courseTitle: course.title,
    created: inserted.length > 0,
  };
}
