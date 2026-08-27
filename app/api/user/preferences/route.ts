import { getAuthUser } from '../../../../lib/auth/server';
import { db } from '../../../../src/db';
import { users } from '../../../../src/schema';
import { eq } from 'drizzle-orm';
import { isLanguageEnabled } from '../../../../lib/language-registry';

export async function GET() {
  const authUser = await getAuthUser();
  if (!authUser) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const [user] = await db
    .select({
      preferredTargetLanguage: users.preferredTargetLanguage,
      nativeLanguage: users.nativeLanguage,
      preferredMode: users.preferredMode,
      dailyGoalMinutes: users.dailyGoalMinutes,
      level: users.level,
    })
    .from(users)
    .where(eq(users.id, authUser.id));

  if (!user) {
    return Response.json({ error: 'User not found' }, { status: 404 });
  }

  return Response.json({ preferences: user });
}

export async function PUT(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const updateData: Record<string, unknown> = {};

  // Validated against the configured catalogue, not the compiled-in constants:
  // a learner must not be able to select a language an admin has disabled, and
  // must be able to select one an admin has added.
  if (typeof body.preferredTargetLanguage === 'string' && body.preferredTargetLanguage) {
    if (!(await isLanguageEnabled(body.preferredTargetLanguage, 'target'))) {
      return Response.json({ error: 'Unknown target language' }, { status: 400 });
    }
    updateData.preferredTargetLanguage = body.preferredTargetLanguage;
  }

  if (typeof body.nativeLanguage === 'string' && body.nativeLanguage) {
    if (!(await isLanguageEnabled(body.nativeLanguage, 'native'))) {
      return Response.json({ error: 'Unknown native language' }, { status: 400 });
    }
    updateData.nativeLanguage = body.nativeLanguage;
  }

  if (typeof body.preferredMode === 'string' && body.preferredMode) {
    updateData.preferredMode = body.preferredMode;
  }

  if (typeof body.dailyGoalMinutes === 'number' && body.dailyGoalMinutes > 0) {
    updateData.dailyGoalMinutes = body.dailyGoalMinutes;
  }

  if (Object.keys(updateData).length === 0) {
    return Response.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  await db.update(users).set(updateData).where(eq(users.id, authUser.id));

  return Response.json({ success: true });
}
