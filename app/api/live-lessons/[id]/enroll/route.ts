import { and, eq } from 'drizzle-orm';
import { db } from '@/src/db';
import { chatRoomMembers, liveLessonEnrollments, liveLessons } from '@/src/schema';
import { getAuthUser } from '@/lib/auth/server';
import { enrolLearner, loadLiveLessonForUser } from '@/lib/tutors/rooms-data';
import { TUTORS_ENABLED } from '@/lib/tutors/config';
import { publish } from '@/lib/realtime/bus';
import { topics } from '@/lib/realtime/topics';

export const runtime = 'nodejs';

/**
 * Enrol in a live lesson.
 *
 * Capacity is enforced inside a transaction under an advisory lock rather
 * than by a count-then-insert: two learners taking the last seat at the same
 * moment would both read the same count and both be admitted.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!TUTORS_ENABLED) {
    return Response.json({ error: 'Live tutoring is not enabled.' }, { status: 404 });
  }

  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const lessonId = Number((await params).id);
  if (!Number.isInteger(lessonId)) {
    return Response.json({ error: 'Invalid live lesson id' }, { status: 400 });
  }

  const found = await loadLiveLessonForUser(lessonId, user.id);
  if (!found) return Response.json({ error: 'Live lesson not found' }, { status: 404 });
  if (found.isTutor) {
    return Response.json({ error: 'You are teaching this live lesson' }, { status: 400 });
  }
  if (found.liveLesson.status === 'cancelled') {
    return Response.json({ error: 'This live lesson was cancelled' }, { status: 409 });
  }

  const result = await enrolLearner(lessonId, user.id, found.liveLesson);

  if (!result.ok) {
    return Response.json({ error: result.reason }, { status: 409 });
  }

  await publish(topics.liveLesson(lessonId), { type: 'lesson.updated', lessonId });
  return Response.json({ success: true }, { status: 201 });
}

/**
 * Withdraw from a live lesson.
 *
 * The row is kept and marked cancelled rather than deleted: a tutor looking
 * at their register should be able to see that someone signed up and pulled
 * out, not silently find one fewer name.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!TUTORS_ENABLED) {
    return Response.json({ error: 'Live tutoring is not enabled.' }, { status: 404 });
  }

  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const lessonId = Number((await params).id);
  if (!Number.isInteger(lessonId)) {
    return Response.json({ error: 'Invalid live lesson id' }, { status: 400 });
  }

  const [row] = await db
    .select({ id: liveLessons.id, chatRoomId: liveLessons.chatRoomId })
    .from(liveLessons)
    .where(eq(liveLessons.id, lessonId))
    .limit(1);
  if (!row) return Response.json({ error: 'Live lesson not found' }, { status: 404 });

  await db
    .update(liveLessonEnrollments)
    .set({ status: 'cancelled' })
    .where(and(
      eq(liveLessonEnrollments.liveLessonId, lessonId),
      eq(liveLessonEnrollments.learnerId, user.id),
    ));

  // Chat membership goes with the seat: someone who withdrew should not keep
  // reading the room.
  if (row.chatRoomId) {
    await db
      .delete(chatRoomMembers)
      .where(and(
        eq(chatRoomMembers.roomId, row.chatRoomId),
        eq(chatRoomMembers.userId, user.id),
      ));
  }

  await publish(topics.liveLesson(lessonId), { type: 'lesson.updated', lessonId });
  return Response.json({ success: true });
}
