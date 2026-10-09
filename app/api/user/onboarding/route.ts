import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/server';
import { toUserRole } from '@/lib/auth/roles';
import { db } from '@/src/db';
import { users, countries, studentProgress, domains } from '@/src/schema';
import { and, eq } from 'drizzle-orm';
import { enrollInCourse } from '@/lib/courses/enroll';
import { seedLessonPlan } from '@/lib/calendar/seed-lesson-plan';
import { nativeLanguageFromAcceptLanguage } from '@/lib/language';
import { isLanguageEnabled, loadLanguageCatalog } from '@/lib/language-registry';
import { cacheDel, cacheKeys } from '@/lib/cache';
import { sanitizeOccupation, serializeInterests } from '@/lib/study-packs/profile';

export async function POST(req: NextRequest) {
  const authUser = await getAuthUser();
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { level, learningGoal, preferredDomainId, preferredMode, ageRange, targetLanguage, nativeLanguage, dailyGoalMinutes, countryCode, occupation, interests } = body;

  const updateData: Record<string, unknown> = {};
  if (typeof level === 'string' && level) updateData.level = level;
  if (typeof learningGoal === 'string' && learningGoal) updateData.learningGoal = learningGoal;
  if (typeof preferredDomainId === 'number') updateData.preferredDomainId = preferredDomainId;
  if (typeof preferredMode === 'string' && preferredMode) updateData.preferredMode = preferredMode;
  if (typeof ageRange === 'string' && ageRange) updateData.ageRange = ageRange;
  // Checked against the configured catalogue, as PUT /api/user/preferences
  // does. An unknown code is dropped rather than rejected: failing the last
  // step of the wizard over one answer would strand the learner, and a
  // dropped native language is still inferred below.
  if (typeof targetLanguage === 'string' && targetLanguage && await isLanguageEnabled(targetLanguage, 'target')) {
    updateData.preferredTargetLanguage = targetLanguage;
  }
  if (typeof nativeLanguage === 'string' && nativeLanguage && await isLanguageEnabled(nativeLanguage, 'native')) {
    updateData.nativeLanguage = nativeLanguage;
  }
  if (typeof dailyGoalMinutes === 'number' && dailyGoalMinutes > 0) updateData.dailyGoalMinutes = dailyGoalMinutes;
  const cleanOccupation = sanitizeOccupation(occupation);
  if (cleanOccupation) updateData.occupation = cleanOccupation;
  const cleanInterests = Array.isArray(interests) ? serializeInterests(interests) : null;
  if (cleanInterests) updateData.interests = cleanInterests;

  // A learner who skipped the language question still gets explanations in a
  // language they read: the browser's Accept-Language first, then (below) the
  // country they picked. The 'en' column default is only the last resort.
  if (typeof updateData.nativeLanguage !== 'string') {
    await loadLanguageCatalog();
    const inferred = nativeLanguageFromAcceptLanguage(req.headers.get('accept-language'));
    if (inferred) updateData.nativeLanguage = inferred;
  }

  if (typeof countryCode === 'string' && countryCode) {
    const [country] = await db.select().from(countries).where(eq(countries.code, countryCode));
    if (!country) {
      return NextResponse.json({ error: 'Unknown country code' }, { status: 400 });
    }
    updateData.countryCode = countryCode;
    if (typeof updateData.nativeLanguage !== 'string') {
      updateData.nativeLanguage = country.defaultNativeLanguage;
    }
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  await db.update(users).set({
    ...updateData,
    onboardingCompletedAt: new Date(),
  }).where(eq(users.id, authUser.id));
  if ('nativeLanguage' in updateData) await cacheDel(cacheKeys.uiNativeLanguage(authUser.id));

  // Preferences alone left the learner with nothing to follow. Enrolment is
  // the other half of finishing onboarding: it creates the student_progress
  // row the course page reads. The landing itself is the Library domain they
  // picked as "practice first"; `preferredMode` still drives free-form
  // practice once they open a situation.
  const [saved] = await db
    .select({
      level: users.level,
      preferredTargetLanguage: users.preferredTargetLanguage,
      nativeLanguage: users.nativeLanguage,
      preferredDomainId: users.preferredDomainId,
      role: users.role,
    })
    .from(users)
    .where(eq(users.id, authUser.id))
    .limit(1);

  // A tutor finishes onboarding through the tutor wizard, which asks for a
  // language to be taught *in*, not one to learn. Enrolling them in a course
  // and seeding a lesson plan off it would put a course they never chose
  // on their calendar. Admins keep the learner path — they are learners too.
  const isTutor = toUserRole(saved?.role) === 'tutor';

  let enrollment: Awaited<ReturnType<typeof enrollInCourse>> = null;
  if (saved && !isTutor) {
    try {
      enrollment = await enrollInCourse({
        userId: authUser.id,
        level: saved.level,
        targetLanguage: saved.preferredTargetLanguage,
        nativeLanguage: saved.nativeLanguage,
      });

      // The personalized plan promised at the end of the wizard: turn the
      // course position enrolment just created into dated reminders on
      // the learner's calendar. Only for a fresh enrolment — replaying
      // onboarding on an already-enrolled learner has nothing new to plan.
      if (enrollment?.created) {
        const [progress] = await db
          .select({ currentUnitId: studentProgress.currentUnitId })
          .from(studentProgress)
          .where(and(
            eq(studentProgress.userId, authUser.id),
            eq(studentProgress.courseId, enrollment.courseId),
            eq(studentProgress.targetLanguage, saved.preferredTargetLanguage),
          ))
          .limit(1);

        await seedLessonPlan({
          userId: authUser.id,
          courseId: enrollment.courseId,
          currentUnitId: progress?.currentUnitId ?? null,
        });
      }
    } catch (err) {
      // The preferences are already saved and onboarding is genuinely done —
      // a failed enrolment or plan-seeding must not send the learner back
      // through the wizard.
      console.error('[onboarding] enrolment failed', err);
    }
  }

  // The wizard asked what to practise first; that is a Library domain, not a
  // course. Enrolment still happens so Courses and the calendar are not empty,
  // but the hand-off follows the domain they picked.
  let domainSlug: string | null = null;
  if (saved?.preferredDomainId) {
    const [domain] = await db
      .select({ slug: domains.slug })
      .from(domains)
      .where(eq(domains.id, saved.preferredDomainId))
      .limit(1);
    domainSlug = domain?.slug ?? null;
  }

  return NextResponse.json({
    success: true,
    domainSlug,
    courseSlug: enrollment?.courseSlug ?? null,
    targetLanguage: saved?.preferredTargetLanguage ?? null,
    nativeLanguage: saved?.nativeLanguage ?? null,
  });
}
