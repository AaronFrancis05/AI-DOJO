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
/** A stored timezone is user data; an unknown one must not throw the route. */
function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Milliseconds `timeZone` is ahead of UTC at the given instant. */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(instant);

  const at = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    at('year'), at('month') - 1, at('day'),
    at('hour') % 24, at('minute'), at('second'),
  );
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The calendar date and weekday `instant` falls on inside `timeZone`. */
function zonedDateParts(instant: Date, timeZone: string): { year: number; month: number; day: number; weekday: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(instant);
  const at = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return {
    year: Number(at('year')),
    month: Number(at('month')),
    day: Number(at('day')),
    weekday: WEEKDAYS.indexOf(at('weekday')),
  };
}

/**
 * The UTC instant at which `minuteOfDay` on the given local date occurs in
 * `timeZone`.
 *
 * Resolved in two passes: the first offset is read at the naive guess, the
 * second at the corrected instant. That second read is what gets a slot on a
 * DST transition day right — the offset that applies at 09:00 local is not
 * necessarily the one that applied at midnight.
 */
function zonedWallClockToUtc(
  year: number, month: number, day: number, minuteOfDay: number, timeZone: string,
): Date {
  const naive = Date.UTC(year, month - 1, day, 0, minuteOfDay);
  let instant = naive - zoneOffsetMs(new Date(naive), timeZone);
  instant = naive - zoneOffsetMs(new Date(instant), timeZone);
  return new Date(instant);
}

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

  // The pattern is stored as a weekday plus minutes-from-midnight in the
  // TUTOR's timezone. Expanding it with the server's own clock put every slot
  // out by the offset between the two — a tutor in Kampala advertising 09:00
  // showed up as 06:00 to a server running in UTC.
  const timeZone = isValidTimeZone(tutor.timezone) ? tutor.timezone : 'UTC';

  for (let dayOffset = 0; dayOffset < days; dayOffset++) {
    const { year, month, day: dayOfMonth, weekday } =
      zonedDateParts(new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000), timeZone);

    for (const p of pattern.filter((x) => x.dayOfWeek === weekday)) {
      const start = zonedWallClockToUtc(year, month, dayOfMonth, p.startMinute, timeZone);
      const end = zonedWallClockToUtc(year, month, dayOfMonth, p.endMinute, timeZone);

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
