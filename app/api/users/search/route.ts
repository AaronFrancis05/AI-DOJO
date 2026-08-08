import { db } from '../../../../src/db';
import { users } from '../../../../src/schema';
import { getAuthUser } from '../../../../lib/auth/server';
import { and, or, not, eq, ilike } from 'drizzle-orm';

export async function GET(req: Request) {
  const user = await getAuthUser();
  if (!user) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  if (q.length < 2) {
    return Response.json({ error: 'Search query must be at least 2 characters' }, { status: 400 });
  }

  const pattern = `%${q}%`;
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      avatarSrc: users.avatarSrc,
      nativeLanguage: users.nativeLanguage,
    })
    .from(users)
    .where(
      and(
        or(
          ilike(users.name, pattern),
          ilike(users.email, pattern),
        ),
        not(eq(users.id, user.id)),
      ),
    )
    .limit(20);

  return Response.json({ success: true, users: rows });
}