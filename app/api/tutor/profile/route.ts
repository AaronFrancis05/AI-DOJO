import { eq } from 'drizzle-orm';
import { db } from '@/src/db';
import { tutors } from '@/src/schema';
import { requireRole, roleErrorResponse } from '@/lib/auth/server';
import {
  parseLanguageCodes,
  serializeLanguageCodes,
  tutorLanguageSets,
  unknownLanguageCodes,
} from '@/lib/tutors/languages';

export const runtime = 'nodejs';

const MAX_HOURLY_RATE_CENTS = 100_000; // $1,000/hr — a typo guard, not a policy

/**
 * The signed-in tutor's own profile.
 *
 * Singular `/api/tutor/*` is "my teaching", the same split as
 * `/api/tutor/availability` versus the plural `/api/tutors` a learner browses.
 * The console needs this because both scheduling pickers are constrained to
 * what this tutor actually holds: they may only teach a language in
 * `languages`, and only explain in one from `instructionLanguages`.
 */
export async function GET() {
  let user;
  try {
    ({ user } = await requireRole('tutor'));
  } catch (err) {
    return roleErrorResponse(err);
  }

  const [profile] = await db.select().from(tutors).where(eq(tutors.userId, user.id)).limit(1);
  if (!profile) return Response.json({ error: 'No tutor profile' }, { status: 404 });

  const { teaches, explainsIn } = tutorLanguageSets(profile);

  return Response.json({
    success: true,
    profile: {
      id: profile.id,
      headline: profile.headline,
      bio: profile.bio,
      languages: teaches,
      instructionLanguages: explainsIn,
      hourlyRateCents: profile.hourlyRateCents,
      currency: profile.currency,
      timezone: profile.timezone,
      verificationStatus: profile.verificationStatus,
      isAcceptingBookings: profile.isAcceptingBookings,
    },
  });
}

/**
 * Edits the tutor's own profile.
 *
 * Deliberately partial: only the fields sent are written, so the console can
 * save one section without round-tripping the rest. `verificationStatus` is
 * **not** editable here — that is an admin decision (`PATCH
 * /api/admin/tutors/[id]`), and letting a tutor set it would make verification
 * meaningless.
 */
export async function PATCH(req: Request) {
  let user;
  try {
    ({ user } = await requireRole('tutor'));
  } catch (err) {
    return roleErrorResponse(err);
  }

  const [profile] = await db
    .select({ id: tutors.id })
    .from(tutors)
    .where(eq(tutors.userId, user.id))
    .limit(1);
  if (!profile) return Response.json({ error: 'No tutor profile' }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return Response.json({ error: 'Invalid body' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  if (typeof body.headline === 'string') {
    const headline = body.headline.trim();
    if (!headline) return Response.json({ error: 'A headline is required' }, { status: 400 });
    updates.headline = headline.slice(0, 160);
  }

  if (typeof body.bio === 'string' || body.bio === null) {
    updates.bio = typeof body.bio === 'string' && body.bio.trim() ? body.bio.trim() : null;
  }

  // The two sets validate against opposite sides of the catalogue — see
  // lib/tutors/languages.ts. Each is refused empty: a tutor with no teaching
  // language cannot be listed, and one with no explanation language cannot
  // schedule anything.
  if (body.languages !== undefined) {
    const codes = parseLanguageCodes(body.languages);
    if (codes.length === 0) {
      return Response.json({ error: 'Select at least one language you teach' }, { status: 400 });
    }
    const unknown = await unknownLanguageCodes(codes, 'target');
    if (unknown.length > 0) {
      return Response.json({ error: `Unsupported language: ${unknown.join(', ')}` }, { status: 400 });
    }
    updates.languages = serializeLanguageCodes(codes);
  }

  if (body.instructionLanguages !== undefined) {
    const codes = parseLanguageCodes(body.instructionLanguages);
    if (codes.length === 0) {
      return Response.json(
        { error: 'Select at least one language you can explain in' },
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
    updates.instructionLanguages = serializeLanguageCodes(codes);
  }

  if (body.hourlyRateCents !== undefined) {
    // Typed before converting: Number('') and Number(null) are both 0, so a
    // blank field would have silently set the rate to free rather than 400.
    if (typeof body.hourlyRateCents !== 'number') {
      return Response.json({ error: 'Hourly rate is out of range' }, { status: 400 });
    }
    const rate = Math.round(body.hourlyRateCents);
    if (!Number.isFinite(rate) || rate < 0 || rate > MAX_HOURLY_RATE_CENTS) {
      return Response.json({ error: 'Hourly rate is out of range' }, { status: 400 });
    }
    updates.hourlyRateCents = rate;
  }

  if (typeof body.isAcceptingBookings === 'boolean') {
    updates.isAcceptingBookings = body.isAcceptingBookings;
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: 'Nothing to update' }, { status: 400 });
  }

  await db.update(tutors).set(updates).where(eq(tutors.id, profile.id));

  return Response.json({ success: true });
}
