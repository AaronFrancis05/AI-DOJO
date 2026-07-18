import { db } from '@/src/db';
import { userAvatars } from '@/src/schema';
import { getAuthUser } from '@/lib/auth/server';
import { eq } from 'drizzle-orm';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const avatarId = Number(id);
  if (isNaN(avatarId)) return Response.json({ error: 'Invalid ID' }, { status: 400 });

  const [avatar] = await db
    .select()
    .from(userAvatars)
    .where(eq(userAvatars.id, avatarId))
    .limit(1);

  if (!avatar || avatar.userId !== user.id) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  await db.update(userAvatars).set({ isSelected: false }).where(eq(userAvatars.userId, user.id));
  await db.update(userAvatars).set({ isSelected: true }).where(eq(userAvatars.id, avatarId));

  return Response.json({ success: true });
}
