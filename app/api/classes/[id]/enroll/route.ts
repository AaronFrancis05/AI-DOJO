import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db';
import { dbPool } from '@/src/db-pool';
import { chatRoomMembers, classEnrollments, classSessions } from '@/src/schema';
import { getAuthUser } from '@/lib/auth/server';
import { loadClassForUser } from '@/lib/tutors/rooms-data';
import { TUTORS_ENABLED } from '@/lib/tutors/config';
import { publish } from '@/lib/realtime/bus';
import { topics } from '@/lib/realtime/topics';

export const runtime = 'nodejs';

/**
 * Enrol in a class.
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

  const classId = Number((await params).id);
  if (!Number.isInteger(classId)) {
    return Response.json({ error: 'Invalid class id' }, { status: 400 });
  }

  const found = await loadClassForUser(classId, user.id);
  if (!found) return Response.json({ error: 'Class not found' }, { status: 404 });
  if (found.isTutor) {
    return Response.json({ error: 'You are teaching this class' }, { status: 400 });
  }
  if (found.classSession.status === 'cancelled') {
    return Response.json({ error: 'This class was cancelled' }, { status: 409 });
  }

  const result = await dbPool.transaction(async (tx) => {
    // Namespaced away from the session lock the roleplay writer takes: both
    // use pg_advisory_xact_lock with a bare integer, and a class id colliding
    // with a session id would serialise two unrelated things.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${classId}, 1)`);

    const [{ taken }] = await tx
      .select({ taken: sql<number>`count(*)::int` })
      .from(classEnrollments)
      .where(and(
        eq(classEnrollments.classSessionId, classId),
        sql`${classEnrollments.status} <> 'cancelled'`,
      ));

    const [existing] = await tx
      .select()
      .from(classEnrollments)
      .where(and(
        eq(classEnrollments.classSessionId, classId),
        eq(classEnrollments.learnerId, user.id),
      ))
      .limit(1);

    if (existing && existing.status !== 'cancelled') return { ok: true as const };
    if (Number(taken) >= found.classSession.capacity) {
      return { ok: false as const, reason: 'This class is full' };
    }

    await tx
      .insert(classEnrollments)
      .values({ classSessionId: classId, learnerId: user.id, status: 'enrolled' })
      .onConflictDoUpdate({
        target: [classEnrollments.classSessionId, classEnrollments.learnerId],
        set: { status: 'enrolled', enrolledAt: new Date() },
      });

    // The classroom's chat sidebar is a normal chat room, so enrolling has to
    // add the learner to it — otherwise the sidebar 403s inside the room.
    if (found.classSession.chatRoomId) {
      await tx
        .insert(chatRoomMembers)
        .values({ roomId: found.classSession.chatRoomId, userId: user.id })
        .onConflictDoNothing();
    }

    return { ok: true as const };
  });

  if (!result.ok) {
    return Response.json({ error: result.reason }, { status: 409 });
  }

  await publish(topics.classSession(classId), { type: 'class.updated', classId });
  return Response.json({ success: true }, { status: 201 });
}

/**
 * Withdraw from a class.
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

  const classId = Number((await params).id);
  if (!Number.isInteger(classId)) {
    return Response.json({ error: 'Invalid class id' }, { status: 400 });
  }

  const [row] = await db
    .select({ id: classSessions.id, chatRoomId: classSessions.chatRoomId })
    .from(classSessions)
    .where(eq(classSessions.id, classId))
    .limit(1);
  if (!row) return Response.json({ error: 'Class not found' }, { status: 404 });

  await db
    .update(classEnrollments)
    .set({ status: 'cancelled' })
    .where(and(
      eq(classEnrollments.classSessionId, classId),
      eq(classEnrollments.learnerId, user.id),
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

  await publish(topics.classSession(classId), { type: 'class.updated', classId });
  return Response.json({ success: true });
}
