import { eq, inArray } from 'drizzle-orm';
import { db } from '@/src/db';
import { tutors, users } from '@/src/schema';
import { requireRole, roleErrorResponse } from '@/lib/auth/server';
import { isAudienceKind, resolveAudience } from '@/lib/tutors/audience';
import { TUTORS_ENABLED } from '@/lib/tutors/config';

export const runtime = 'nodejs';

/**
 * Everyone this tutor teaches, across classes, bookings and assessments.
 *
 * The roster the console's Learners tab renders, and the same membership
 * `resolveAudience` uses for announcements and cohort rooms — so the list a
 * tutor is looking at is exactly who a message would reach.
 *
 * `?audienceKind=` narrows it (`class` with `classSessionId`, `course` with
 * `courseId`); the default is every learner they have ever taught.
 */
export async function GET(req: Request) {
  if (!TUTORS_ENABLED) {
    return Response.json({ error: 'Live tutoring is not enabled.' }, { status: 404 });
  }

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

  const url = new URL(req.url);
  const rawKind = url.searchParams.get('audienceKind') ?? 'all_my_learners';
  if (!isAudienceKind(rawKind)) {
    return Response.json({ error: 'Unknown audience' }, { status: 400 });
  }

  const classSessionId = url.searchParams.get('classSessionId');
  const courseId = url.searchParams.get('courseId');

  const audience = await resolveAudience(profile.id, rawKind, {
    classSessionId: classSessionId ? Number(classSessionId) : null,
    courseId: courseId ? Number(courseId) : null,
    targetLanguage: url.searchParams.get('targetLanguage'),
  });
  if (audience.error) return Response.json({ error: audience.error }, { status: 400 });
  if (audience.learnerIds.length === 0) {
    return Response.json({ success: true, learners: [] });
  }

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      avatarSrc: users.avatarSrc,
      level: users.level,
      nativeLanguage: users.nativeLanguage,
      preferredTargetLanguage: users.preferredTargetLanguage,
      lastActiveDate: users.lastActiveDate,
    })
    .from(users)
    .where(inArray(users.id, audience.learnerIds));

  return Response.json({
    success: true,
    learners: rows.sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email)),
  });
}
