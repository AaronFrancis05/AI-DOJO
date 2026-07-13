/* ───────────────────────────────────────────────
   UserContext — single source of truth for the
   currently authenticated user across the shell.
   AppShell reads the server-resolved user once and
   provides it here so every child page (Home,
   Leaderboard, Sidebar, etc.) reads the same data.
   ─────────────────────────────────────────────── */

'use client';

import { createContext, useContext, type ReactNode } from 'react';

export interface UserContextValue {
  id: string;
  name: string;
  email: string;
  level: string;        // 'beginner' | 'intermediate' | 'advanced'
  tier: 'free' | 'premium';
  xp: number;
  xpToNext: number;
  streak: number;
  avatarSrc?: string | null;
  avatarColor?: string;
}

const UserContext = createContext<UserContextValue | null>(null);

export function UserProvider({
  value,
  children,
}: {
  value: UserContextValue | null;
  children: ReactNode;
}) {
  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser(): UserContextValue | null {
  return useContext(UserContext);
}
