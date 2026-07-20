import { db } from '@/src/db';
import { users } from '@/src/schema';
import { getAuthUser } from '@/lib/auth/server';
import { eq } from 'drizzle-orm';

export async function PATCH(req: Request) {
  const user = await getAuthUser();
  if (!user) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await req.json();
  const { avatarSrc } = body;

  if (avatarSrc !== null && typeof avatarSrc !== 'string') {
    return Response.json({ error: 'avatarSrc must be a string or null' }, { status: 400 });
  }

  await db.update(users).set({ avatarSrc }).where(eq(users.id, user.id));

  return Response.json({ success: true, avatarSrc });
}

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const [dbUser] = await db
    .select({ avatarSrc: users.avatarSrc })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  return Response.json({ avatarSrc: dbUser?.avatarSrc ?? null });
}
