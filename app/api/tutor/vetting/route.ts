import { eq } from 'drizzle-orm';
import { db } from '@/src/db';
import { tutors } from '@/src/schema';
import { requireRole, roleErrorResponse } from '@/lib/auth/server';
import { HYBRID_ENABLED, TUTORS_ENABLED } from '@/lib/tutors/config';
import { loadVetting } from '@/lib/tutors/vetting';
import { quizPassed } from '@/lib/tutors/vetting-content';

export const runtime = 'nodejs';

async function loadOwnProfile(userId: string) {
  const [row] = await db
    .select({
      id: tutors.id,
      verificationStatus: tutors.verificationStatus,
      vettingPlacementId: tutors.vettingPlacementId,
      clarityScore: tutors.clarityScore,
      trialLessonScores: tutors.trialLessonScores,
      teachingModuleCompletedAt: tutors.teachingModuleCompletedAt,
    })
    .from(tutors)
    .where(eq(tutors.userId, userId))
    .limit(1);
  return row ?? null;
}

/**
 * The applicant's own vetting checklist (PLAN.md 4.6): proficiency interview,
 * clarity read-aloud, teaching-method module, and the trial lesson the admin
 * scores. The interview itself runs through /api/placement?purpose=tutor_vetting.
 */
export async function GET() {
  if (!TUTORS_ENABLED || !HYBRID_ENABLED) return Response.json({ error: 'Not found' }, { status: 404 });

  let user;
  try {
    ({ user } = await requireRole('tutor'));
  } catch (err) {
    return roleErrorResponse(err);
  }

  const profile = await loadOwnProfile(user.id);
  if (!profile) return Response.json({ error: 'No tutor profile' }, { status: 404 });

  const vetting = (await loadVetting([profile])).get(profile.id);
  return Response.json({ success: true, verificationStatus: profile.verificationStatus, vetting });
}

/**
 * Records a self-serve step:
 *   { clarityScore }           the read-aloud result
 *   { teachingModule: answers } the module's check questions
 *
 * The clarity score is measured in the browser by the Azure Speech SDK — the
 * same client-side pronunciation assessment the roleplay uses — so the server
 * cannot witness it. It is bounds-checked here and shown to the admin as
 * self-measured; the trial lesson the admin watches is the human check on it.
 */
export async function PUT(req: Request) {
  if (!TUTORS_ENABLED || !HYBRID_ENABLED) return Response.json({ error: 'Not found' }, { status: 404 });

  let user;
  try {
    ({ user } = await requireRole('tutor'));
  } catch (err) {
    return roleErrorResponse(err);
  }

  const profile = await loadOwnProfile(user.id);
  if (!profile) return Response.json({ error: 'No tutor profile' }, { status: 404 });

  const body = await req.json().catch(() => null);
  const update: Partial<typeof tutors.$inferInsert> = {};

  if (body?.clarityScore !== undefined) {
    const score = Number(body.clarityScore);
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      return Response.json({ error: 'Clarity score must be between 0 and 100' }, { status: 400 });
    }
    update.clarityScore = Math.round(score);
  }

  if (body?.teachingModule !== undefined) {
    if (!quizPassed(body.teachingModule)) {
      return Response.json(
        { error: 'Some answers were not right. Read the section again and retry.' },
        { status: 422 },
      );
    }
    update.teachingModuleCompletedAt = profile.teachingModuleCompletedAt ?? new Date();
  }

  if (Object.keys(update).length === 0) {
    return Response.json({ error: 'Nothing to record' }, { status: 400 });
  }

  await db.update(tutors).set(update).where(eq(tutors.id, profile.id));
  const vetting = (await loadVetting([{ ...profile, ...update } as typeof profile])).get(profile.id);
  return Response.json({ success: true, vetting });
}
