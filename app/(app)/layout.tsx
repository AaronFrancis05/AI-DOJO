import { redirect } from 'next/navigation';
import { AppShell } from '@/components/shell/AppShell';
import { getAuthUserReadOnly } from '@/lib/auth/server';
import { syncUser } from '@/lib/auth/sync-user';
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
    await syncUser({
      id: u.id,
      email: u.email ?? '',
      name: u.name ?? 'Learner',
    }).catch((err) => console.error('[sync-user] failed', err));

    const [dbUser] = await db
      .select({
        name: users.name,
        email: users.email,
        level: users.level,
        xp: users.xp,
        xpToNext: users.xpToNext,
        tier: users.tier,
        streak: users.streak,
        avatarSrc: users.avatarSrc,
        dailyGoalMinutes: users.dailyGoalMinutes,
        onboardingCompletedAt: users.onboardingCompletedAt,
      })
      .from(users)
      .where(eq(users.id, u.id))
      .limit(1);

    // Redirect to onboarding if the user hasn't completed it yet
    if (dbUser && !dbUser.onboardingCompletedAt) {
      redirect('/onboarding/level');
    }

    user = {
      id: u.id,
      name: dbUser?.name ?? u.name ?? 'Learner',
      email: dbUser?.email ?? u.email ?? '',
      level: dbUser?.level ?? 'beginner',
      tier: (dbUser?.tier ?? 'free') as 'free' | 'premium',
      xp: dbUser?.xp ?? 0,
      xpToNext: dbUser?.xpToNext ?? 1000,
      streak: dbUser?.streak ?? 0,
      avatarSrc: dbUser?.avatarSrc ?? null,
      avatarColor: '#2D3BC5',
      dailyGoalMinutes: dbUser?.dailyGoalMinutes ?? 30,
    };
  }

  return (
    <UserProvider value={user}>
      <AppShell>{children}</AppShell>
    </UserProvider>
  );
}
