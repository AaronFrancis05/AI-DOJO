import { db } from '@/src/db';
import { users } from '@/src/schema';
import { eq } from 'drizzle-orm';

export type AuthUser = {
  id: string;
  email: string;
  name: string;
};

export async function syncUser(authUser: AuthUser) {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, authUser.id))
    .limit(1);

  if (existing) return;

  await db.insert(users).values({
    id: authUser.id,
    name: authUser.name,
    email: authUser.email,
  });
}
