import { db } from '@/src/db';
import { userAvatars } from '@/src/schema';
import { getAuthUser } from '@/lib/auth/server';
import { eq, desc } from 'drizzle-orm';
import { cacheGet, cacheSet, cacheDel, cacheKeys, TTL } from '@/lib/cache';

export async function GET() {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  const cacheKey = cacheKeys.userAvatars(user.id);

  const cached = await cacheGet<typeof avatars>(cacheKey);
  if (cached) return Response.json({ success: true, avatars: cached });

  const avatars = await db
    .select()
    .from(userAvatars)
    .where(eq(userAvatars.userId, user.id))
    .orderBy(desc(userAvatars.createdAt));

  await cacheSet(cacheKey, avatars, TTL.AVATARS);

  return Response.json({ success: true, avatars });
}

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await req.json();
  const { avatarUrl, thumbnailUrl } = body;

  if (!avatarUrl || typeof avatarUrl !== 'string') {
    return Response.json({ error: 'avatarUrl is required' }, { status: 400 });
  }

  await db.update(userAvatars).set({ isSelected: false }).where(eq(userAvatars.userId, user.id));

  const [inserted] = await db.insert(userAvatars).values({
    userId: user.id,
    avatarUrl,
    thumbnailUrl: thumbnailUrl ?? null,
    isSelected: true,
    source: 'avaturn',
  }).returning();

  await cacheDel(cacheKeys.userAvatars(user.id));

  return Response.json({ success: true, avatar: inserted });
}
