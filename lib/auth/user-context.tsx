'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { UserRole } from '@/lib/auth/roles';

export interface UserContextValue {
  id: string;
  name: string;
  email: string;
  level: string;
  /** `users.role` — drives which nav entries and consoles are offered.
   *  Never the authority for access: every tutor/admin route re-checks it
   *  server-side through requireRole(). */
  role: UserRole;
  /** True when this account's organization membership role is admin.
   *  Display only — `/organization` re-checks the membership. */
  organizationAdmin?: boolean;
  /** Display only. Absent for tutors and anyone with no membership. */
  organizationName?: string | null;
  groupNames?: string[];
  /**
   * Learner catalogue. False when a private organization has no bookable
   * tutor, and when the public organization has none at all. Admins stay
   * true. Hiding the link is convenience — the tutor routes re-check.
   */
  canBrowseTutors?: boolean;
  /** `tutors.verification_status` for a tutor account, null for anyone else.
   *  Display only — what a pending tutor is allowed to do is decided by the
   *  routes that read the column themselves. */
  tutorStatus?: string | null;
  tier: 'free' | 'premium';
  xp: number;
  xpToNext: number;
  streak: number;
  avatarSrc?: string | null;
  avatarColor?: string;
  dailyGoalMinutes?: number;
  nativeLanguage?: string;
  preferredTargetLanguage?: string;
  countryCode?: string | null;
}

interface UserContextType {
  user: UserContextValue | null;
  setAvatarSrc: (src: string | null) => void;
}

const UserContext = createContext<UserContextType | null>(null);

export function UserProvider({
  value,
  children,
}: {
  value: UserContextValue | null;
  children: ReactNode;
}) {
  const [avatarSrc, setAvatarSrc] = useState<string | null | undefined>(value?.avatarSrc);

  const handleSetAvatarSrc = useCallback((src: string | null) => {
    setAvatarSrc(src);
  }, []);

  const merged = value
    ? { ...value, avatarSrc: avatarSrc ?? value.avatarSrc }
    : null;

  return (
    <UserContext.Provider value={{ user: merged, setAvatarSrc: handleSetAvatarSrc }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser(): UserContextValue | null {
  const ctx = useContext(UserContext);
  return ctx?.user ?? null;
}

export function useSetAvatarSrc(): (src: string | null) => void {
  const ctx = useContext(UserContext);
  return ctx?.setAvatarSrc ?? (() => {});
}
