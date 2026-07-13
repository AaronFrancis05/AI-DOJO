import { AppShell } from '@/components/shell/AppShell';
import { getAuthUserReadOnly } from '@/lib/auth/server';
import { UserProvider } from '@/lib/auth/user-context';
import { db } from '@/src/db';
import { users } from '@/src/schema';
import { eq } from 'drizzle-orm';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const authUser = await getAuthUserReadOnly();
  const u = authUser as { id?: string; name?: string; email?: string } | null;

  let user: import('@/lib/auth/user-context').UserContextValue | null = null;

  if (u?.id) {
    const [dbUser] = await db
      .select({
        name: users.name,
        email: users.email,
        level: users.level,
        xp: users.xp,
        xpToNext: users.xpToNext,
        tier: users.tier,
        streak: users.streak,
      })
      .from(users)
      .where(eq(users.id, u.id))
      .limit(1);

    user = {
      id: u.id,
      name: dbUser?.name ?? u.name ?? 'Learner',
      email: dbUser?.email ?? u.email ?? '',
      level: dbUser?.level ?? 'beginner',
      tier: (dbUser?.tier ?? 'premium') as 'free' | 'premium',
      xp: dbUser?.xp ?? 0,
      xpToNext: dbUser?.xpToNext ?? 1000,
      streak: dbUser?.streak ?? 0,
      avatarSrc: null,
      avatarColor: '#2D3BC5',
    };
  }

  return (
    <UserProvider value={user}>
      <AppShell>{children}</AppShell>
    </UserProvider>
  );
}
