import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/server';
import { db } from '@/src/db';
import { users, countries } from '@/src/schema';
import { eq } from 'drizzle-orm';

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

  return NextResponse.json({ success: true });
}
