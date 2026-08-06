import { db } from '@/src/db';
import { courses, courseLevels, units, lessons } from '@/src/schema';
import { asc, eq, sql } from 'drizzle-orm';

export async function GET() {
  const list = await db
    .select()
    .from(courses)
    .where(eq(courses.isActive, true))
    .orderBy(asc(courses.displayOrder));

  const [levelCounts, lessonCounts] = await Promise.all([
    db
      .select({ courseId: courseLevels.courseId, n: sql<number>`count(*)::int` })
      .from(courseLevels)
      .groupBy(courseLevels.courseId),
    db
      .select({ courseId: courseLevels.courseId, n: sql<number>`count(*)::int` })
      .from(lessons)
      .innerJoin(units, eq(lessons.unitId, units.id))
      .innerJoin(courseLevels, eq(units.levelId, courseLevels.id))
      .where(eq(lessons.isActive, true))
      .groupBy(courseLevels.courseId),
  ]);

  const levelsByCourse = new Map(levelCounts.map((r) => [r.courseId, r.n]));
  const lessonsByCourse = new Map(lessonCounts.map((r) => [r.courseId, r.n]));

  const coursesWithStats = list.map((c) => ({
    ...c,
    levelCount: levelsByCourse.get(c.id) ?? 0,
    lessonCount: lessonsByCourse.get(c.id) ?? 0,
  }));

  return Response.json({ success: true, courses: coursesWithStats });
}
