import { db } from '@/src/db';
import { calendarTasks, courseLevels, lessons, units } from '@/src/schema';
import { and, asc, eq, inArray } from 'drizzle-orm';

/**
 * How many upcoming lessons get a reminder the moment onboarding finishes —
 * one lesson per calendar day, starting tomorrow. A fixed horizon rather than
 * "the whole course" so the calendar doesn't fill with months of reminders
 * for lessons the learner is nowhere near yet.
 */
const LESSON_PLAN_HORIZON_DAYS = 14;

interface SeedLessonPlanInput {
  userId: string;
  courseId: number;
  /** `student_progress.current_unit_id` — where the walk starts. */
  currentUnitId: number | null;
}

/**
 * Seeds `calendar_tasks` with the learner's personalized lesson plan right
 * after onboarding enrolls them in a course. Walks the same
 * levels → units → lessons order `lib/curriculum/enroll.ts` uses to pick the
 * first lesson, starting from the unit onboarding already landed them on.
 *
 * Safe to call more than once: `onConflictDoNothing` on
 * `uq_calendar_tasks_user_lesson` means a lesson that already has a reminder
 * is left alone rather than duplicated or reset.
 */
export async function seedLessonPlan({ userId, courseId, currentUnitId }: SeedLessonPlanInput): Promise<void> {
  const levelRows = await db
    .select({ id: courseLevels.id })
    .from(courseLevels)
    .where(and(eq(courseLevels.courseId, courseId), eq(courseLevels.isActive, true)))
    .orderBy(asc(courseLevels.sequenceOrder));
  if (levelRows.length === 0) return;

  const unitRows = await db
    .select({ id: units.id, levelId: units.levelId })
    .from(units)
    .where(inArray(units.levelId, levelRows.map((l) => l.id)))
    .orderBy(asc(units.sequenceOrder));
  if (unitRows.length === 0) return;

  const startIndex = currentUnitId != null
    ? Math.max(0, unitRows.findIndex((u) => u.id === currentUnitId))
    : 0;
  const unitIdsFromStart = unitRows.slice(startIndex).map((u) => u.id);
  if (unitIdsFromStart.length === 0) return;

  const lessonRows = await db
    .select({ id: lessons.id, title: lessons.title, unitId: lessons.unitId })
    .from(lessons)
    .where(and(inArray(lessons.unitId, unitIdsFromStart), eq(lessons.isActive, true)))
    .orderBy(asc(lessons.sequenceOrder));
  if (lessonRows.length === 0) return;

  // Preserve unit order, then lesson order within each unit — matching how
  // the course page walks the curriculum.
  const unitOrder = new Map(unitIdsFromStart.map((id, i) => [id, i]));
  const ordered = [...lessonRows].sort((a, b) => (unitOrder.get(a.unitId)! - unitOrder.get(b.unitId)!));

  const plan = ordered.slice(0, LESSON_PLAN_HORIZON_DAYS);
  if (plan.length === 0) return;

  const startOfTomorrowUtc = new Date();
  startOfTomorrowUtc.setUTCHours(0, 0, 0, 0);
  startOfTomorrowUtc.setUTCDate(startOfTomorrowUtc.getUTCDate() + 1);

  await db.insert(calendarTasks).values(
    plan.map((lesson, i) => ({
      userId,
      title: `Lesson: ${lesson.title}`,
      dueAt: new Date(startOfTomorrowUtc.getTime() + i * 24 * 60 * 60 * 1000),
      allDay: true,
      kind: 'lesson_reminder',
      sourceLessonId: lesson.id,
      status: 'pending',
    })),
  ).onConflictDoNothing({
    target: [calendarTasks.userId, calendarTasks.sourceLessonId],
  });
}
