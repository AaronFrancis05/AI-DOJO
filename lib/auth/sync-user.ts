import { db } from '@/src/db';
import { users } from '@/src/schema';
import { eq } from 'drizzle-orm';

export type AuthUser = {
  id: string;
  email: string;
  // Optional on purpose: the auth provider's metadata may carry no display
  // name (email-link signups, OAuth without a name claim). A missing name is
  // NEVER a reason to write a placeholder over an existing display name.
  name?: string | null;
};

function realName(name: string | null | undefined): string {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  return trimmed;
}

export async function syncUser(authUser: AuthUser): Promise<string> {
  // Look up by email — the auth provider's id may differ from the DB row's id
  // (e.g. after a Neon auth provider key rotation), but the email is stable.
  const [existing] = await db
    .select({ id: users.id, authUserId: users.authUserId })
    .from(users)
    .where(eq(users.email, authUser.email))
    .limit(1);

  if (existing) {
    // Keep the existing id so FK refs from sessions stay intact. Only touch
    // the display name when the provider actually has one — previously this
    // wrote the caller's fallback string (e.g. 'Learner') over real names.
    const name = realName(authUser.name);
    // Stamp the auth identity if it is missing or has moved (a provider key
    // rotation reissues ids). Without it the row looks like an unclaimed
    // invitation to reconcileDeletedAuthUsers() and outlives its own account.
    const authUserId = existing.authUserId !== authUser.id ? authUser.id : undefined;
    if (!name && !authUserId) return existing.id;
    await db
      .update(users)
      .set({ ...(name ? { name } : {}), ...(authUserId ? { authUserId } : {}) })
      .where(eq(users.id, existing.id));
    return existing.id;
  }

  // New user — insert with the auth provider's id. The column is notNull, so
  // an absent name inserts as '' rather than inventing an identity.
  await db.insert(users).values({
    id: authUser.id,
    authUserId: authUser.id,
    name: realName(authUser.name),
    email: authUser.email,
  });
  return authUser.id;
}
