import { eq } from 'drizzle-orm';
import { db } from '@/src/db';
import { canDoProgress, units } from '@/src/schema';
import { getAuthUser } from '@/lib/auth/server';
import { loadBookingForUser } from '@/lib/tutors/bookings';
import { HYBRID_ENABLED } from '@/lib/tutors/config';
import { isCanDoStatus, parseCanDo } from '@/lib/courses/syllabus';

export const runtime = 'nodejs';

/**
 * The tutor marks one can-do statement of a unit after the lesson (PLAN.md
 * 4.7): introduced, practised or achieved. Scoped to a booking so a tutor can
 * only mark learners they have taught. `confirmedAt` is left to the AI
 * sessions and the CEFR re-test; a tutor's mark is not its own confirmation.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!HYBRID_ENABLED) return Response.json({ error: 'Not found' }, { status: 404 });
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const bookingId = Number((await params).id);
  if (!Number.isInteger(bookingId)) return Response.json({ error: 'Invalid booking id' }, { status: 400 });

  const found = await loadBookingForUser(bookingId, user.id);
  if (!found) return Response.json({ error: 'Booking not found' }, { status: 404 });
  if (!found.isTutor) return Response.json({ error: 'Only the tutor can do that' }, { status: 403 });
  if (found.booking.status === 'cancelled') return Response.json({ error: 'This booking was cancelled' }, { status: 409 });

  const body = await req.json().catch(() => null);
  const unitId = Number(body?.unitId);
  const statementIndex = Number(body?.statementIndex);
  if (!Number.isInteger(unitId) || !Number.isInteger(statementIndex) || !isCanDoStatus(body?.status)) {
    return Response.json({ error: 'unitId, statementIndex and a valid status are required' }, { status: 400 });
  }

  const [unit] = await db.select({ canDo: units.canDo }).from(units).where(eq(units.id, unitId)).limit(1);
  const statements = parseCanDo(unit?.canDo);
  if (!unit || statementIndex < 0 || statementIndex >= statements.length) {
    return Response.json({ error: 'No such can-do statement' }, { status: 404 });
  }

  const now = new Date();
  await db
    .insert(canDoProgress)
    .values({
      userId: found.booking.learnerId,
      unitId,
      statementIndex,
      status: body.status,
      markedByTutorId: found.booking.tutorId,
      bookingId,
    })
    .onConflictDoUpdate({
      target: [canDoProgress.userId, canDoProgress.unitId, canDoProgress.statementIndex],
      set: {
        status: body.status,
        markedByTutorId: found.booking.tutorId,
        bookingId,
        updatedAt: now,
      },
    });

  return Response.json({ success: true });
}
