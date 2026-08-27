import { db } from '@/src/db';
import { tutors, users } from '@/src/schema';
import { eq } from 'drizzle-orm';
import { getAuthUser } from '@/lib/auth/server';
import {
  parseLanguageCodes,
  serializeLanguageCodes,
  unknownLanguageCodes,
} from '@/lib/tutors/languages';

export const runtime = 'nodejs';

const MAX_HOURLY_RATE_CENTS = 100_000; // $1,000/hr — a typo guard, not a policy

/** A stored timezone is user data; an unknown one must not reach the DB. */
function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Turns the signed-in account into a pending tutor.
 *
 * Two writes, both required for the tutor surfaces to work: `users.role`,
 * which is what `requireRole('tutor')` reads, and the `tutors` profile row,
 * which describes what they teach. The profile lands at
 * `verificationStatus: 'pending'` — `GET /api/tutors` only ever lists
 * verified profiles, so applying does not put anyone in front of learners.
 * An admin promotes them from /admin.
 */
export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return Response.json({ error: 'Invalid body' }, { status: 400 });
  }

  const {
    headline,
    bio,
    languages,
    instructionLanguages,
    timezone,
    hourlyRateCents,
    currency,
  } = body as {
    headline?: unknown;
    bio?: unknown;
    languages?: unknown;
    instructionLanguages?: unknown;
    timezone?: unknown;
    hourlyRateCents?: unknown;
    currency?: unknown;
  };

  if (typeof headline !== 'string' || !headline.trim()) {
    return Response.json({ error: 'A headline is required' }, { status: 400 });
  }
  if (headline.trim().length > 160) {
    return Response.json({ error: 'Headline must be 160 characters or fewer' }, { status: 400 });
  }

  // The two sets are validated against opposite sides of the catalogue: a
  // language can be teachable, explainable, or both, and an admin decides which.
  const codes = parseLanguageCodes(languages);
  if (codes.length === 0) {
    return Response.json({ error: 'Select at least one language you teach' }, { status: 400 });
  }
  const unknownTaught = await unknownLanguageCodes(codes, 'target');
  if (unknownTaught.length > 0) {
    return Response.json(
      { error: `Unsupported language: ${unknownTaught.join(', ')}` },
      { status: 400 },
    );
  }

  const instructionCodes = parseLanguageCodes(instructionLanguages);
  if (instructionCodes.length === 0) {
    return Response.json(
      { error: 'Select at least one language you can explain in' },
      { status: 400 },
    );
  }
  const unknownInstruction = await unknownLanguageCodes(instructionCodes, 'native');
  if (unknownInstruction.length > 0) {
    return Response.json(
      { error: `Unsupported explanation language: ${unknownInstruction.join(', ')}` },
      { status: 400 },
    );
  }

  if (typeof timezone !== 'string' || !isValidTimeZone(timezone)) {
    return Response.json({ error: 'A valid IANA timezone is required' }, { status: 400 });
  }

  const rate = typeof hourlyRateCents === 'number' ? Math.round(hourlyRateCents) : 0;
  if (!Number.isFinite(rate) || rate < 0 || rate > MAX_HOURLY_RATE_CENTS) {
    return Response.json({ error: 'Hourly rate is out of range' }, { status: 400 });
  }

  const [existing] = await db.select({ id: tutors.id }).from(tutors).where(eq(tutors.userId, user.id));
  if (existing) {
    return Response.json({ error: 'You already have a tutor profile' }, { status: 409 });
  }

  const [profile] = await db
    .insert(tutors)
    .values({
      userId: user.id,
      headline: headline.trim(),
      bio: typeof bio === 'string' && bio.trim() ? bio.trim() : null,
      // Stored comma-separated, matching the existing denormalized shape.
      languages: serializeLanguageCodes(codes),
      instructionLanguages: serializeLanguageCodes(instructionCodes),
      hourlyRateCents: rate,
      currency: typeof currency === 'string' && currency.length === 3 ? currency.toUpperCase() : 'USD',
      timezone,
      verificationStatus: 'pending',
    })
    .returning();

  // Only after the profile exists — a 'tutor' role with no profile row would
  // let them into /tutor with nothing to show.
  await db.update(users).set({ role: 'tutor' }).where(eq(users.id, user.id));

  return Response.json({
    success: true,
    tutor: { id: profile.id, verificationStatus: profile.verificationStatus },
  });
}
