import { eq } from 'drizzle-orm';
import { db } from '@/src/db';
import { tutorBookings } from '@/src/schema';
import { getAuthUser } from '@/lib/auth/server';
import { loadBookingForUser } from '@/lib/tutors/bookings';
import { HYBRID_ENABLED } from '@/lib/tutors/config';
import { hybridEnabledForLearner } from '@/lib/tutors/hybrid';
import {
  MAX_LESSON_NOTES_CHARS,
  normalizeLessonCorrections,
  parseLessonCorrections,
} from '@/lib/tutors/lesson-notes';
import { announceLessonNotesFiled } from '@/lib/study-packs/server';

export const runtime = 'nodejs';

async function resolve(params: Promise<{ id: string }>) {
  const id = Number((await params).id);
  return Number.isInteger(id) ? id : null;
}

/**
 * The tutor's notes on a 1:1 lesson (PLAN.md 4.2). Both parties may read them
 * — they are about the learner, and the learner's homework is built from them.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!HYBRID_ENABLED) return Response.json({ error: 'Not found' }, { status: 404 });
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const bookingId = await resolve(params);
  if (bookingId == null) return Response.json({ error: 'Invalid booking id' }, { status: 400 });

  const found = await loadBookingForUser(bookingId, user.id);
  if (!found) return Response.json({ error: 'Booking not found' }, { status: 404 });

  return Response.json({
    success: true,
    canEdit: found.isTutor,
    notes: found.booking.lessonNotes,
    corrections: parseLessonCorrections(found.booking.lessonCorrections),
    filedAt: found.booking.notesFiledAt,
  });
}

/**
 * Files (or revises) the notes. The first filing announces them, and
 * generateStudyPack turns the lesson into homework. A revision updates the
 * notes but does not build a second pack: the pack is unique per booking.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!HYBRID_ENABLED) return Response.json({ error: 'Not found' }, { status: 404 });
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const bookingId = await resolve(params);
  if (bookingId == null) return Response.json({ error: 'Invalid booking id' }, { status: 400 });

  const found = await loadBookingForUser(bookingId, user.id);
  if (!found) return Response.json({ error: 'Booking not found' }, { status: 404 });
  if (!found.isTutor) return Response.json({ error: 'Only the tutor can do that' }, { status: 403 });

  const { booking } = found;
  if (booking.status === 'cancelled' || booking.status === 'requested') {
    return Response.json({ error: 'Notes are for a lesson that has been confirmed.' }, { status: 409 });
  }
  if (booking.scheduledAt.getTime() > Date.now()) {
    return Response.json({ error: 'Notes can be filed once the lesson has started.' }, { status: 409 });
  }

  const body = await req.json().catch(() => null);
  const notes = typeof body?.notes === 'string' ? body.notes.trim().slice(0, MAX_LESSON_NOTES_CHARS) : '';
  const corrections = normalizeLessonCorrections(body?.corrections);
  if (!notes && corrections.length === 0) {
    return Response.json({ error: 'Write a note or add at least one correction.' }, { status: 400 });
  }

  const firstFiling = booking.notesFiledAt == null;
  const now = new Date();
  await db
    .update(tutorBookings)
    .set({
      lessonNotes: notes || null,
      lessonCorrections: JSON.stringify(corrections),
      notesFiledAt: booking.notesFiledAt ?? now,
      updatedAt: now,
    })
    .where(eq(tutorBookings.id, bookingId));

  if (firstFiling && (await hybridEnabledForLearner(booking.learnerId))) {
    await announceLessonNotesFiled({ bookingId, userId: booking.learnerId });
  }

  return Response.json({ success: true, corrections, filedAt: booking.notesFiledAt ?? now });
}
