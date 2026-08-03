import { getAuthUser } from '@/lib/auth/server';
import { recordLessonActivity } from '@/lib/curriculum/lesson-progress';
import { lessons } from '@/src/schema';
import { eq } from 'drizzle-orm';
import { db } from '@/src/db';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  const authUser = await getAuthUser();
  if (!authUser) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { lessonId } = await params;
  const numericLessonId = Number(lessonId);
  if (isNaN(numericLessonId)) {
    return Response.json({ error: 'Invalid lessonId' }, { status: 400 });
  }

  let body: { phaseKey?: string; complete?: boolean; score?: number };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const phaseKey = typeof body.phaseKey === 'string' ? body.phaseKey : null;
  const complete = body.complete === true;
  const score = typeof body.score === 'number' ? Math.max(0, Math.min(100, Math.round(body.score))) : null;

  const [lesson] = await db.select().from(lessons).where(eq(lessons.id, numericLessonId));
  if (!lesson) {
    return Response.json({ error: 'Lesson not found' }, { status: 404 });
  }

  const result = await recordLessonActivity({
    userId: authUser.id,
    lessonId: numericLessonId,
    phaseKey,
    complete,
    score,
  });

  return Response.json({ success: true, ...result });
}
