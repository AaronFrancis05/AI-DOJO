import { db } from '@/src/db';
import { tutors, users } from '@/src/schema';
import { and, eq, ne } from 'drizzle-orm';
import { requireRole, roleErrorResponse } from '@/lib/auth/server';
import {
  parseLanguageCodes,
  serializeLanguageCodes,
  unknownLanguageCodes,
} from '@/lib/tutors/languages';

export const runtime = 'nodejs';

const VERIFICATION_STATUSES = ['pending', 'verified', 'rejected'] as const;
type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

function isStatus(value: unknown): value is VerificationStatus {
  return typeof value === 'string' && (VERIFICATION_STATUSES as readonly string[]).includes(value);
}

/**
 * Verifies or rejects one tutor — the human step `src/schema.ts` describes on
 * `tutors.verificationStatus` ("'pending' until a human verifies them"), which
 * until now had no surface to happen on.
 *
 * Rejection also drops the account's role back to 'learner': leaving a
 * rejected applicant with `role: 'tutor'` would keep the tutor console open
 * to them even though no learner can ever book them.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireRole('admin');
  } catch (err) {
    return roleErrorResponse(err);
  }

  const tutorId = Number((await params).id);
  if (!Number.isInteger(tutorId)) {
    return Response.json({ error: 'Invalid tutor id' }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const { verificationStatus, isAcceptingBookings } = (body ?? {}) as {
    verificationStatus?: unknown;
    isAcceptingBookings?: unknown;
  };

  const update: Partial<typeof tutors.$inferInsert> = {};
  if (verificationStatus !== undefined) {
    if (!isStatus(verificationStatus)) {
      return Response.json({ error: 'Unknown verification status' }, { status: 400 });
    }
    update.verificationStatus = verificationStatus;
  }
  if (typeof isAcceptingBookings === 'boolean') {
    update.isAcceptingBookings = isAcceptingBookings;
  }

  // The profile itself is editable here too. An admin correcting a tutor's
  // languages is the difference between "your application is wrong, reapply"
  // and fixing it — and the two language sets are what every scheduling route
  // validates against, so a wrong one blocks the tutor from working at all.
  if (typeof body?.headline === 'string' && body.headline.trim()) {
    update.headline = body.headline.trim().slice(0, 160);
  }
  if (typeof body?.bio === 'string' || body?.bio === null) {
    update.bio = typeof body.bio === 'string' && body.bio.trim() ? body.bio.trim() : null;
  }
  if (typeof body?.timezone === 'string' && body.timezone.trim()) {
    update.timezone = body.timezone.trim().slice(0, 60);
  }
  if (body?.hourlyRateCents !== undefined) {
    // Typed before converting, for the same reason as /api/tutor/profile:
    // Number('') and Number(null) are 0, which would set the rate to free.
    if (typeof body.hourlyRateCents !== 'number') {
      return Response.json({ error: 'Hourly rate is out of range' }, { status: 400 });
    }
    const rate = Math.round(body.hourlyRateCents);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100_000) {
      return Response.json({ error: 'Hourly rate is out of range' }, { status: 400 });
    }
    update.hourlyRateCents = rate;
  }
  if (body?.languages !== undefined) {
    const codes = parseLanguageCodes(body.languages);
    if (codes.length === 0) {
      return Response.json({ error: 'A tutor must teach at least one language' }, { status: 400 });
    }
    const unknown = await unknownLanguageCodes(codes, 'target');
    if (unknown.length > 0) {
      return Response.json({ error: `Unsupported language: ${unknown.join(', ')}` }, { status: 400 });
    }
    update.languages = serializeLanguageCodes(codes);
  }
  if (body?.instructionLanguages !== undefined) {
    const codes = parseLanguageCodes(body.instructionLanguages);
    if (codes.length === 0) {
      return Response.json(
        { error: 'A tutor must be able to explain in at least one language' },
        { status: 400 },
      );
    }
    const unknown = await unknownLanguageCodes(codes, 'native');
    if (unknown.length > 0) {
      return Response.json(
        { error: `Unsupported explanation language: ${unknown.join(', ')}` },
        { status: 400 },
      );
    }
    update.instructionLanguages = serializeLanguageCodes(codes);
  }

  if (Object.keys(update).length === 0) {
    return Response.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const [tutor] = await db.select().from(tutors).where(eq(tutors.id, tutorId));
  if (!tutor) {
    return Response.json({ error: 'Tutor not found' }, { status: 404 });
  }

  const [updated] = await db.update(tutors).set(update).where(eq(tutors.id, tutorId)).returning();

  // Never through an admin: a verification decision is about the tutor
  // profile, and demoting an admin who happens to teach would lock them out
  // of the console they just used.
  if (update.verificationStatus === 'rejected') {
    await db.update(users)
      .set({ role: 'learner' })
      .where(and(eq(users.id, tutor.userId), ne(users.role, 'admin')));
  } else if (update.verificationStatus === 'verified') {
    await db.update(users)
      .set({ role: 'tutor' })
      .where(and(eq(users.id, tutor.userId), ne(users.role, 'admin')));
  }

  return Response.json({ success: true, tutor: updated });
}
