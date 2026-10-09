import { getAuthUser } from '../../../../lib/auth/server';
import { db } from '../../../../src/db';
import { users } from '../../../../src/schema';
import { eq } from 'drizzle-orm';
import { isLanguageEnabled } from '../../../../lib/language-registry';
import { cacheDel, cacheKeys } from '../../../../lib/cache';
import { parseInterests, sanitizeOccupation, serializeInterests } from '../../../../lib/study-packs/profile';

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
      occupation: users.occupation,
      interests: users.interests,
    })
    .from(users)
    .where(eq(users.id, authUser.id));

  if (!user) {
    return Response.json({ error: 'User not found' }, { status: 404 });
  }

  return Response.json({ preferences: { ...user, interests: parseInterests(user.interests) } });
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

  // Personalization for learner-owned scenarios. An empty value clears it.
  if ('occupation' in body) updateData.occupation = sanitizeOccupation(body.occupation);
  if ('interests' in body) updateData.interests = Array.isArray(body.interests) ? serializeInterests(body.interests) : null;

  if (Object.keys(updateData).length === 0) {
    return Response.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  await db.update(users).set(updateData).where(eq(users.id, authUser.id));
  // The UI locale follows the native language (lib/i18n/server.ts).
  if ('nativeLanguage' in updateData) await cacheDel(cacheKeys.uiNativeLanguage(authUser.id));

  return Response.json({ success: true });
}
