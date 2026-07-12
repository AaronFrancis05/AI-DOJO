/* ───────────────────────────────────────────────
   AppShell — sidebar + content slot, wraps every (app) route
   UserCard lives here, so it's persistent across pages.
   ─────────────────────────────────────────────── */

'use client';

import { Sidebar } from './Sidebar';
import { UserCard } from './UserCard';

interface AppShellProps {
  children: React.ReactNode;
  /** Override default user data — will come from auth later */
  user?: {
    name: string;
    tier: 'free' | 'premium';
    level: number;
    xp: number;
    xpToNext: number;
    avatarSrc?: string | null;
    avatarColor?: string;
  };
}

const defaultUser = {
  name: 'Alex Kim',
  tier: 'premium' as const,
  level: 7,
  xp: 4850,
  xpToNext: 6000,
  avatarSrc: null,
  avatarColor: '#2D3BC5',
};

export function AppShell({ children, user }: AppShellProps) {
  const u = user ?? defaultUser;

  return (
    <div className="flex h-screen w-screen bg-dojo-canvas text-dojo-text-primary overflow-hidden">
      <div className="flex h-full flex-col">
        <Sidebar />
        <UserCard
          name={u.name}
          tier={u.tier}
          level={u.level}
          xp={u.xp}
          xpToNext={u.xpToNext}
          avatarSrc={u.avatarSrc}
          avatarColor={u.avatarColor}
        />
      </div>
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
