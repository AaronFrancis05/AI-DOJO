import { getAuthUser } from '@/lib/auth/server';
import { db } from '@/src/db';
import { studentProgress, studentLessonProgress, courses, lessons } from '@/src/schema';
import { eq, desc } from 'drizzle-orm';

export async function GET() {
  const authUser = await getAuthUser();
  if (!authUser) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [rows, lessonRows] = await Promise.all([
    db
      .select({
        progress: studentProgress,
        course: courses,
        currentLesson: lessons,
      })
      .from(studentProgress)
      .innerJoin(courses, eq(studentProgress.courseId, courses.id))
      .leftJoin(lessons, eq(studentProgress.currentLessonId, lessons.id))
      .where(eq(studentProgress.userId, authUser.id))
      .orderBy(desc(studentProgress.updatedAt)),
    db
      .select()
      .from(studentLessonProgress)
      .where(eq(studentLessonProgress.userId, authUser.id)),
  ]);

  return Response.json({
    success: true,
    progress: rows.map(({ progress, course, currentLesson }) => ({
      ...progress,
      course,
      currentLesson,
    })),
    lessonProgress: lessonRows,
  });
}
