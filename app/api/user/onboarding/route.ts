import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/server';
import { db } from '@/src/db';
import { users } from '@/src/schema';
import { eq } from 'drizzle-orm';

export async function POST(req: NextRequest) {
  const authUser = await getAuthUser();
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { level, learningGoal, preferredDomainId, preferredMode, ageRange, nativeLanguage, dailyGoalMinutes } = body;

  const updateData: Record<string, unknown> = {};
  if (typeof level === 'string' && level) updateData.level = level;
  if (typeof learningGoal === 'string' && learningGoal) updateData.learningGoal = learningGoal;
  if (typeof preferredDomainId === 'number') updateData.preferredDomainId = preferredDomainId;
  if (typeof preferredMode === 'string' && preferredMode) updateData.preferredMode = preferredMode;
  if (typeof ageRange === 'string' && ageRange) updateData.ageRange = ageRange;
  if (typeof nativeLanguage === 'string' && nativeLanguage) updateData.nativeLanguage = nativeLanguage;
  if (typeof dailyGoalMinutes === 'number' && dailyGoalMinutes > 0) updateData.dailyGoalMinutes = dailyGoalMinutes;

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  await db.update(users).set(updateData).where(eq(users.id, authUser.id));

  return NextResponse.json({ success: true });
}
