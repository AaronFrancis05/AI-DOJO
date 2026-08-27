import { db } from '@/src/db';
import { tutors, users } from '@/src/schema';
import { and, eq } from 'drizzle-orm';
import { getAuthUser } from '@/lib/auth/server';
import { parseLanguageCodes, tutorLanguageSets } from '@/lib/tutors/languages';

/**
 * Lists bookable tutors, optionally filtered to one target language.
 *
 * Only verified tutors who are accepting bookings are ever returned — an
 * unverified profile must not be reachable from the learner-facing catalogue.
 */
export async function GET(req: Request) {
  const user = await getAuthUser();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const lang = new URL(req.url).searchParams.get('lang');

  const rows = await db
    .select({
      id: tutors.id,
      headline: tutors.headline,
      bio: tutors.bio,
      languages: tutors.languages,
      hourlyRateCents: tutors.hourlyRateCents,
      currency: tutors.currency,
      timezone: tutors.timezone,
      name: users.name,
      avatarSrc: users.avatarSrc,
      countryCode: users.countryCode,
    })
    .from(tutors)
    .innerJoin(users, eq(tutors.userId, users.id))
    .where(and(
      eq(tutors.verificationStatus, 'verified'),
      eq(tutors.isAcceptingBookings, true),
    ))
    .orderBy(tutors.id);

  // `languages` is a comma-separated code list, so filtering happens here
  // rather than in SQL to avoid a LIKE that would match 'ja' inside 'jav'.
  const filtered = lang
    ? rows.filter((t) => t.languages.split(',').map((s) => s.trim()).includes(lang))
    : rows;

  return Response.json({
    success: true,
    tutors: filtered.map((t) => ({
      ...t,
      languages: t.languages.split(',').map((s) => s.trim()).filter(Boolean),
    })),
  });
}
