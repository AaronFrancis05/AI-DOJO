import { AppShell } from '@/components/shell/AppShell';
import { getAuthUserReadOnly } from '@/lib/auth/server';
import { UserProvider } from '@/lib/auth/user-context';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const authUser = await getAuthUserReadOnly();

  const u = authUser as { id?: string; name?: string; email?: string; level?: string } | null;
  const user = u
    ? {
        id: u.id ?? '',
        name: u.name ?? 'Learner',
        email: u.email ?? '',
        level: u.level ?? 'beginner',
        tier: 'premium' as const,
        xp: 0,
        xpToNext: 1000,
        streak: 0,
        avatarSrc: null,
        avatarColor: '#2D3BC5',
      }
    : null;

  return (
    <UserProvider value={user}>
      <AppShell>{children}</AppShell>
    </UserProvider>
  );
}
