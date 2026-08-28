import { db } from '@/src/db';
import { tutors, users } from '@/src/schema';
import { desc, eq } from 'drizzle-orm';
import { requireRole, roleErrorResponse } from '@/lib/auth/server';
import { tutorLanguageSets } from '@/lib/tutors/languages';

export const runtime = 'nodejs';

/**
 * Every tutor profile, in whatever verification state.
 *
 * Deliberately not `GET /api/tutors`, which only ever returns verified,
 * bookable profiles — the console's whole job is the ones that route hides.
 */
export async function GET() {
  try {
    await requireRole('admin');
  } catch (err) {
    return roleErrorResponse(err);
  }

  const rows = await db
    .select({
      id: tutors.id,
      userId: tutors.userId,
      headline: tutors.headline,
      bio: tutors.bio,
      languages: tutors.languages,
      instructionLanguages: tutors.instructionLanguages,
      hourlyRateCents: tutors.hourlyRateCents,
      currency: tutors.currency,
      timezone: tutors.timezone,
      verificationStatus: tutors.verificationStatus,
      isAcceptingBookings: tutors.isAcceptingBookings,
      createdAt: tutors.createdAt,
      name: users.name,
      email: users.email,
      role: users.role,
      accountStatus: users.status,
    })
    .from(tutors)
    .innerJoin(users, eq(tutors.userId, users.id))
    .orderBy(desc(tutors.createdAt));

  return Response.json({
    success: true,
    tutors: rows.map((t) => {
      const { teaches, explainsIn } = tutorLanguageSets(t);
      return { ...t, languages: teaches, instructionLanguages: explainsIn };
    }),
  });
}
