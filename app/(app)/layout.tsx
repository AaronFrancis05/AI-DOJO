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
    const authId = u.id;
    // Pass the provider's name through only when it is actually a name —
    // syncUser must never write a placeholder over an existing display name.
    const providerName = typeof u.name === 'string' && u.name.trim() ? u.name.trim() : '';
    await syncUser({
      id: authId,
      email: u.email ?? '',
      name: providerName || null,
    }).catch((err) => console.error('[sync-user] failed', err));

    const loadDbUser = () =>
      db
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
          nativeLanguage: users.nativeLanguage,
          preferredTargetLanguage: users.preferredTargetLanguage,
          countryCode: users.countryCode,
        })
        .from(users)
        .where(eq(users.id, authId))
        .limit(1);

    // A transient pool/network blip must not silently degrade the whole
    // identity to fallbacks — retry once before giving up on the row.
    let dbUser: Awaited<ReturnType<typeof loadDbUser>>[number] | undefined;
    try {
      [dbUser] = await loadDbUser();
    } catch (firstErr) {
      console.error('[app-layout] user read failed, retrying', firstErr);
      try {
        [dbUser] = await loadDbUser();
      } catch (err) {
        console.error('[app-layout] user read failed twice', err);
      }
    }

    user = {
      id: authId,
      name: dbUser?.name || providerName || '',
      email: dbUser?.email || u.email || '',
      level: dbUser?.level ?? 'beginner',
      tier: (dbUser?.tier ?? 'free') as 'free' | 'premium',
      xp: dbUser?.xp ?? 0,
      xpToNext: dbUser?.xpToNext ?? 1000,
      streak: dbUser?.streak ?? 0,
      avatarSrc: dbUser?.avatarSrc ?? null,
      avatarColor: '#2D3BC5',
      dailyGoalMinutes: dbUser?.dailyGoalMinutes ?? 30,
      nativeLanguage: dbUser?.nativeLanguage ?? 'en',
      preferredTargetLanguage: dbUser?.preferredTargetLanguage ?? 'ja',
      countryCode: dbUser?.countryCode ?? null,
    };
  }

  return (
    <UserProvider value={user}>
      <AppShell>{children}</AppShell>
    </UserProvider>
  );
}
