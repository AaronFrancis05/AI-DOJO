import { db } from '@/src/db';
import { tutors, users } from '@/src/schema';
import { HYBRID_ENABLED } from '@/lib/tutors/config';
import { loadTutorTrust } from '@/lib/tutors/quality';
import { rankBySharedLanguage, shouldWarnBeforeBooking } from '@/lib/tutors/matching';
import { isCefrLevel } from '@/lib/interview/cefr';
import { and, eq } from 'drizzle-orm';
import { getAuthUser } from '@/lib/auth/server';
import { tutorLanguageSets } from '@/lib/tutors/languages';
import { loadTutorAccess } from '@/lib/organizations/tutor-access';

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
  const access = await loadTutorAccess(user.id);
  if (!access.unrestricted && access.isDefault == null) {
    return Response.json({ success: true, tutors: [] });
  }

  const rows = await db
    .select({
      id: tutors.id,
      headline: tutors.headline,
      bio: tutors.bio,
      languages: tutors.languages,
      instructionLanguages: tutors.instructionLanguages,
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
      eq(users.status, 'active'),
    ))
    .orderBy(tutors.id);

  // Both language fields are comma-separated code lists, parsed through the one
  // helper so this listing agrees with `/api/tutor/profile` and the scheduling
  // routes about what a tutor holds. Filtering happens here rather than in SQL
  // to avoid a LIKE that would match 'ja' inside 'jav'.
  const parsed = rows.map((t) => {
    const { teaches, explainsIn } = tutorLanguageSets(t);
    return { ...t, languages: teaches, instructionLanguages: explainsIn };
  });

  const permitted = access.isDefault === false
    ? parsed.filter((t) => access.permittedIds?.has(t.id))
    : parsed;
  const filtered = lang ? permitted.filter((t) => t.languages.includes(lang)) : permitted;

  if (!HYBRID_ENABLED) return Response.json({ success: true, tutors: filtered });

  // Hybrid tutoring (PLAN.md 4.4, 4.8): the trust badge's real stored values,
  // and beginners see tutors who can explain in their language first.
  const [[learner], trust] = await Promise.all([
    db
      .select({ nativeLanguage: users.nativeLanguage, cefrLevel: users.cefrLevel })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1),
    loadTutorTrust(filtered.map((t) => t.id)),
  ]);
  const level = isCefrLevel(learner?.cefrLevel) ? learner.cefrLevel : null;
  const ranked = rankBySharedLanguage(filtered, learner?.nativeLanguage ?? 'en', level);

  return Response.json({
    success: true,
    learnerLevel: level,
    warnBeforeBooking: shouldWarnBeforeBooking(level),
    tutors: ranked.map((t) => {
      const tr = trust.get(t.id);
      return {
        ...t,
        trust: tr
          ? {
              cefrLevel: tr.cefrLevel,
              clarityScore: tr.clarityScore,
              averageRating: tr.averageRating,
              reviewCount: tr.reviewCount,
              completedLessons: tr.completedLessons,
            }
          : null,
      };
    }),
  });
}
