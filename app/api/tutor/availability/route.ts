import { asc, eq } from 'drizzle-orm';
import { db } from '@/src/db';
import { dbPool } from '@/src/db-pool';
import { tutorAvailability, tutors } from '@/src/schema';
import { requireRole, roleErrorResponse } from '@/lib/auth/server';

export const runtime = 'nodejs';

/** A day can hold a lot of slots, but not an unbounded number. */
const MAX_SLOTS = 100;

/**
 * The signed-in tutor's own weekly availability pattern.
 *
 * Separate from `GET /api/tutors/[id]/availability`, which expands the same
 * pattern into concrete bookable datetimes for a *learner*. This one is the
 * raw recurring rule, because that is what an editor edits — expanding it and
 * then trying to infer the rule back from the result would be lossy.
 *
 * Times are minutes from midnight in the tutor's own timezone, matching the
 * column comments in src/schema.ts.
 */
export async function GET() {
  let user;
  try {
    ({ user } = await requireRole('tutor'));
  } catch (err) {
    return roleErrorResponse(err);
  }

  const [tutorProfile] = await db
    .select()
    .from(tutors)
    .where(eq(tutors.userId, user.id))
    .limit(1);
  if (!tutorProfile) return Response.json({ error: 'No tutor profile' }, { status: 404 });

  const slots = await db
    .select({
      id: tutorAvailability.id,
      dayOfWeek: tutorAvailability.dayOfWeek,
      startMinute: tutorAvailability.startMinute,
      endMinute: tutorAvailability.endMinute,
    })
    .from(tutorAvailability)
    .where(eq(tutorAvailability.tutorId, tutorProfile.id))
    .orderBy(asc(tutorAvailability.dayOfWeek), asc(tutorAvailability.startMinute));

  return Response.json({
    success: true,
    timezone: tutorProfile.timezone,
    isAcceptingBookings: tutorProfile.isAcceptingBookings,
    verificationStatus: tutorProfile.verificationStatus,
    slots,
  });
}

/**
 * Replaces the whole pattern.
 *
 * A wholesale replace rather than per-slot edits: the editor works on a week
 * at a time, and a partial update would leave the stored pattern and the one
 * on screen able to disagree. Done in a transaction so a failed insert cannot
 * leave a tutor with no availability at all.
 */
export async function PUT(req: Request) {
  let user;
  try {
    ({ user } = await requireRole('tutor'));
  } catch (err) {
    return roleErrorResponse(err);
  }

  const [tutorProfile] = await db
    .select()
    .from(tutors)
    .where(eq(tutors.userId, user.id))
    .limit(1);
  if (!tutorProfile) return Response.json({ error: 'No tutor profile' }, { status: 404 });

  let body: { slots?: unknown; isAcceptingBookings?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const raw = Array.isArray(body.slots) ? body.slots : [];
  if (raw.length > MAX_SLOTS) {
    return Response.json({ error: `At most ${MAX_SLOTS} slots` }, { status: 400 });
  }

  const slots: { dayOfWeek: number; startMinute: number; endMinute: number }[] = [];
  for (const item of raw) {
    const dayOfWeek = Number((item as { dayOfWeek?: unknown })?.dayOfWeek);
    const startMinute = Number((item as { startMinute?: unknown })?.startMinute);
    const endMinute = Number((item as { endMinute?: unknown })?.endMinute);

    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
      return Response.json({ error: 'dayOfWeek must be 0-6' }, { status: 400 });
    }
    if (
      !Number.isInteger(startMinute) || !Number.isInteger(endMinute) ||
      startMinute < 0 || endMinute > 24 * 60 || endMinute <= startMinute
    ) {
      return Response.json({ error: 'Invalid slot times' }, { status: 400 });
    }
    slots.push({ dayOfWeek, startMinute, endMinute });
  }

  // The unique index is on (tutorId, dayOfWeek, startMinute), so two slots
  // starting at the same minute would fail the insert half-way. Caught here
  // as a 400 rather than surfacing as a database error.
  const keys = new Set(slots.map((s) => `${s.dayOfWeek}:${s.startMinute}`));
  if (keys.size !== slots.length) {
    return Response.json(
      { error: 'Two slots start at the same time on the same day' },
      { status: 400 },
    );
  }

  await dbPool.transaction(async (tx) => {
    await tx.delete(tutorAvailability).where(eq(tutorAvailability.tutorId, tutorProfile.id));
    if (slots.length > 0) {
      await tx
        .insert(tutorAvailability)
        .values(slots.map((s) => ({ ...s, tutorId: tutorProfile.id })));
    }
    if (typeof body.isAcceptingBookings === 'boolean') {
      await tx
        .update(tutors)
        .set({ isAcceptingBookings: body.isAcceptingBookings })
        .where(eq(tutors.id, tutorProfile.id));
    }
  });

  return Response.json({ success: true, count: slots.length });
}
