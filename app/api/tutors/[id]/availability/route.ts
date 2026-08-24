import { db } from '@/src/db';
import { tutorAvailability, tutorBookings, tutors } from '@/src/schema';
import { and, eq, gte, lte, ne } from 'drizzle-orm';
import { getAuthUser } from '@/lib/auth/server';

/**
 * Bookable slots for one tutor over the next `days` days.
 *
 * Availability is stored as a recurring weekly pattern (day-of-week +
 * minute-of-day, in the tutor's own timezone). This expands that pattern into
 * concrete datetimes and removes anything already taken, so the client never
 * has to reason about recurrence or double-booking.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tutorId = Number((await params).id);
  if (!Number.isInteger(tutorId)) {
    return Response.json({ error: 'Invalid tutor id' }, { status: 400 });
  }

  const [tutor] = await db.select().from(tutors).where(eq(tutors.id, tutorId));
  if (!tutor || tutor.verificationStatus !== 'verified') {
    return Response.json({ error: 'Tutor not found' }, { status: 404 });
  }

  const days = Math.min(30, Math.max(1, Number(new URL(req.url).searchParams.get('days')) || 14));

  const now = new Date();
  const horizon = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const [pattern, taken] = await Promise.all([
    db.select().from(tutorAvailability).where(eq(tutorAvailability.tutorId, tutorId)),
    db
      .select({ scheduledAt: tutorBookings.scheduledAt, durationMinutes: tutorBookings.durationMinutes })
      .from(tutorBookings)
      .where(and(
        eq(tutorBookings.tutorId, tutorId),
        ne(tutorBookings.status, 'cancelled'),
        gte(tutorBookings.scheduledAt, now),
        lte(tutorBookings.scheduledAt, horizon),
      )),
  ]);

  const takenRanges = taken.map((b) => {
    const start = b.scheduledAt.getTime();
    return { start, end: start + b.durationMinutes * 60 * 1000 };
  });

  const slots: { startsAt: string; endsAt: string }[] = [];

  for (let dayOffset = 0; dayOffset < days; dayOffset++) {
    const day = new Date(now);
    day.setDate(day.getDate() + dayOffset);
    day.setHours(0, 0, 0, 0);

    for (const p of pattern.filter((x) => x.dayOfWeek === day.getDay())) {
      const start = new Date(day);
      start.setMinutes(p.startMinute);
      const end = new Date(day);
      end.setMinutes(p.endMinute);

      // A slot that has already started is not bookable.
      if (start.getTime() <= now.getTime()) continue;

      const overlaps = takenRanges.some(
        (r) => start.getTime() < r.end && end.getTime() > r.start,
      );
      if (overlaps) continue;

      slots.push({ startsAt: start.toISOString(), endsAt: end.toISOString() });
    }
  }

  slots.sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  return Response.json({ success: true, timezone: tutor.timezone, slots });
}
