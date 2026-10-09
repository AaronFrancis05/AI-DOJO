import { db } from '@/src/db';
import { tutors, users } from '@/src/schema';
import { desc, eq } from 'drizzle-orm';
import { requireRole, roleErrorResponse } from '@/lib/auth/server';
import { tutorLanguageSets } from '@/lib/tutors/languages';
import { HYBRID_ENABLED } from '@/lib/tutors/config';
import { loadVetting } from '@/lib/tutors/vetting';
import { loadTutorTrust } from '@/lib/tutors/quality';
import { parseTrialScores } from '@/lib/tutors/quality-rules';

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
      vettingPlacementId: tutors.vettingPlacementId,
      clarityScore: tutors.clarityScore,
      trialLessonScores: tutors.trialLessonScores,
      teachingModuleCompletedAt: tutors.teachingModuleCompletedAt,
      reviewFlaggedAt: tutors.reviewFlaggedAt,
      reviewFlagReason: tutors.reviewFlagReason,
      name: users.name,
      email: users.email,
      role: users.role,
      accountStatus: users.status,
    })
    .from(tutors)
    .innerJoin(users, eq(tutors.userId, users.id))
    .orderBy(desc(tutors.createdAt));

  // Vetting evidence and quality signals (PLAN.md 4.6), so the admin approves
  // on evidence. `readyForReview` is false while any check is outstanding —
  // an applicant below C1 never reaches the verify button.
  const [vetting, trust] = HYBRID_ENABLED
    ? await Promise.all([loadVetting(rows), loadTutorTrust(rows.map((t) => t.id))])
    : [null, null];

  return Response.json({
    success: true,
    vettingEnabled: HYBRID_ENABLED,
    tutors: rows.map((t) => {
      const { teaches, explainsIn } = tutorLanguageSets(t);
      const v = vetting?.get(t.id) ?? null;
      return {
        ...t,
        trialLessonScores: parseTrialScores(t.trialLessonScores),
        languages: teaches,
        instructionLanguages: explainsIn,
        vetting: v,
        readyForReview: v ? v.gaps.length === 0 : true,
        trust: trust?.get(t.id) ?? null,
      };
    }),
  });
}
