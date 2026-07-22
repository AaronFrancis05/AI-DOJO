import { db } from '../../../../src/db';
import { userPreferences } from '../../../../src/schema';
import { eq } from 'drizzle-orm';
import { getAuthUser } from '../../../../lib/auth/server';

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const [prefs] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, user.id));

  return Response.json({
    voiceGender: prefs?.voiceGender ?? 'female',
  });
}

export async function PUT(req: Request) {
  const user = await getAuthUser();
  if (!user) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await req.json();
  const { voiceGender } = body;

  if (!voiceGender || !['female', 'male'].includes(voiceGender)) {
    return Response.json({ error: 'voiceGender must be "female" or "male"' }, { status: 400 });
  }

  await db
    .insert(userPreferences)
    .values({ userId: user.id, voiceGender, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: { voiceGender, updatedAt: new Date() },
    });

  return Response.json({ success: true, voiceGender });
}
