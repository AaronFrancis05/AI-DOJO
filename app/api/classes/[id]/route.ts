import { eq } from 'drizzle-orm';
import { db } from '@/src/db';
import { classSessions } from '@/src/schema';
import { getAuthUser } from '@/lib/auth/server';
import { loadClassForUser, loadClassRoster } from '@/lib/tutors/rooms-data';
import { canJoinBooking } from '@/lib/tutors/rooms';
import { TUTORS_ENABLED } from '@/lib/tutors/config';
import { createNotifications } from '@/lib/notifications';
import { publish } from '@/lib/realtime/bus';
import { topics } from '@/lib/realtime/topics';

export const runtime = 'nodejs';

const CLASS_STATUSES = ['scheduled', 'live', 'completed', 'cancelled'] as const;

export async function GET(
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

  const roster = await loadClassRoster(classId);
  const decision = canJoinBooking({
    scheduledAt: found.classSession.scheduledAt,
    durationMinutes: found.classSession.durationMinutes,
    status: found.classSession.status,
  });

  return Response.json({
    success: true,
    classSession: {
      id: found.classSession.id,
      title: found.classSession.title,
      description: found.classSession.description,
      tutorName: found.tutorName,
      courseId: found.classSession.courseId,
      unitId: found.classSession.unitId,
      targetLanguage: found.classSession.targetLanguage,
      scheduledAt: found.classSession.scheduledAt,
      durationMinutes: found.classSession.durationMinutes,
      capacity: found.classSession.capacity,
      status: found.classSession.status,
      chatRoomId: found.classSession.chatRoomId,
      isTutor: found.isTutor,
      myEnrollmentStatus: found.enrollment?.status ?? null,
      canJoin: decision.allowed,
      joinBlockedReason: decision.allowed ? null : decision.reason,
    },
    // The roster is a list of who else is in the room — shown to the tutor as
    // a register, and to learners as the people they will be talking to.
    roster: roster.map((r) => ({
      learnerId: r.learnerId,
      name: r.name,
      avatarSrc: r.avatarSrc,
      nativeLanguage: r.nativeLanguage,
      status: r.status,
    })),
  });
}

/** Tutor-only status changes: go live, wrap up, cancel. */
export async function PATCH(
  req: Request,
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
  // 404 rather than 403 for a learner: the same reason loadBookingForUser
  // collapses "not found" and "not yours".
  if (!found || !found.isTutor) {
    return Response.json({ error: 'Class not found' }, { status: 404 });
  }

  let body: { status?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const status = String(body.status ?? '');
  if (!(CLASS_STATUSES as readonly string[]).includes(status)) {
    return Response.json({ error: 'Unsupported status' }, { status: 400 });
  }

  await db
    .update(classSessions)
    .set({ status, updatedAt: new Date() })
    .where(eq(classSessions.id, classId));

  await publish(topics.classSession(classId), { type: 'class.updated', classId });

  // A cancellation is the one status change a learner must be told about
  // rather than discover by turning up.
  if (status === 'cancelled') {
    const roster = await loadClassRoster(classId);
    await createNotifications(roster.map((r) => r.learnerId), {
      type: 'class',
      title: 'A live class was cancelled',
      body: `${found.classSession.title} on ${found.classSession.scheduledAt.toLocaleString()} will not run.`,
      href: '/tutors',
    });
  }

  return Response.json({ success: true });
}
