import { db } from '@/src/db';
import { users } from '@/src/schema';
import { eq, sql } from 'drizzle-orm';

export type AuthUser = {
  id: string;
  email: string;
  name: string;
};

export async function syncUser(authUser: AuthUser): Promise<string> {
  // Look up by email — the auth provider's id may differ from the DB row's id
  // (e.g. after a Neon auth provider key rotation), but the email is stable.
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, authUser.email))
    .limit(1);

  if (existing) {
    // Keep the existing id so FK refs from sessions stay intact.
    // Only update the display name.
    await db
      .update(users)
      .set({ name: authUser.name })
      .where(eq(users.id, existing.id));
    return existing.id;
  }

  // New user — insert with the auth provider's id.
  await db.insert(users).values({
    id: authUser.id,
    name: authUser.name,
    email: authUser.email,
  });
  return authUser.id;
}
