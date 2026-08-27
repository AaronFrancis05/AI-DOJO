import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/server';
import { db } from '@/src/db';
import { users, countries, studentProgress } from '@/src/schema';
import { and, eq } from 'drizzle-orm';
import { enrollInCourse } from '@/lib/curriculum/enroll';
import { seedLessonPlan } from '@/lib/calendar/seed-lesson-plan';

export async function POST(req: NextRequest) {
  const authUser = await getAuthUser();
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { level, learningGoal, preferredDomainId, preferredMode, ageRange, targetLanguage, nativeLanguage, dailyGoalMinutes, countryCode } = body;

  const updateData: Record<string, unknown> = {};
  if (typeof level === 'string' && level) updateData.level = level;
  if (typeof learningGoal === 'string' && learningGoal) updateData.learningGoal = learningGoal;
  if (typeof preferredDomainId === 'number') updateData.preferredDomainId = preferredDomainId;
  if (typeof preferredMode === 'string' && preferredMode) updateData.preferredMode = preferredMode;
  if (typeof ageRange === 'string' && ageRange) updateData.ageRange = ageRange;
  if (typeof targetLanguage === 'string' && targetLanguage) updateData.preferredTargetLanguage = targetLanguage;
  if (typeof nativeLanguage === 'string' && nativeLanguage) updateData.nativeLanguage = nativeLanguage;
  if (typeof dailyGoalMinutes === 'number' && dailyGoalMinutes > 0) updateData.dailyGoalMinutes = dailyGoalMinutes;

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

  // Preferences alone left the learner with nothing to follow. Enrolment is
  // the other half of finishing onboarding: it creates the student_progress
  // row the course page reads, so the wizard can hand off to a real course
  // instead of a dashboard. `preferredDomainId` / `preferredMode` keep
  // driving free-form practice exactly as before.
  const [saved] = await db
    .select({
      level: users.level,
      preferredTargetLanguage: users.preferredTargetLanguage,
      nativeLanguage: users.nativeLanguage,
    })
    .from(users)
    .where(eq(users.id, authUser.id))
    .limit(1);

  let enrollment: Awaited<ReturnType<typeof enrollInCourse>> = null;
  if (saved) {
    try {
      enrollment = await enrollInCourse({
        userId: authUser.id,
        level: saved.level,
        targetLanguage: saved.preferredTargetLanguage,
        nativeLanguage: saved.nativeLanguage,
      });

      // The personalized plan promised at the end of the wizard: turn the
      // curriculum position enrolment just created into dated reminders on
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

  return NextResponse.json({
    success: true,
    courseSlug: enrollment?.courseSlug ?? null,
    targetLanguage: saved?.preferredTargetLanguage ?? null,
    nativeLanguage: saved?.nativeLanguage ?? null,
  });
}
