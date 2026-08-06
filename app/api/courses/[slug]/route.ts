import { db } from '@/src/db';
import { courses, courseLevels, units, lessons } from '@/src/schema';
import { asc, eq } from 'drizzle-orm';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const [course] = await db
    .select()
    .from(courses)
    .where(eq(courses.slug, slug));

  if (!course) {
    return Response.json({ success: false, error: 'Course not found' }, { status: 404 });
  }

  const levelRows = await db
    .select()
    .from(courseLevels)
    .where(eq(courseLevels.courseId, course.id))
    .orderBy(asc(courseLevels.sequenceOrder));

  const levels = await Promise.all(
    levelRows.map(async (level) => {
      const unitRows = await db
        .select()
        .from(units)
        .where(eq(units.levelId, level.id))
        .orderBy(asc(units.sequenceOrder));

      const unitList = await Promise.all(
        unitRows.map(async (unit) => {
          const lessonRows = await db
            .select()
            .from(lessons)
            .where(eq(lessons.unitId, unit.id))
            .orderBy(asc(lessons.sequenceOrder));

          return { ...unit, lessons: lessonRows };
        }),
      );

      return { ...level, units: unitList };
    }),
  );

  return Response.json({ success: true, course: { ...course, levels } });
}
