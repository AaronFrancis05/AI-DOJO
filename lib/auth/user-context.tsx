'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export interface UserContextValue {
  id: string;
  name: string;
  email: string;
  level: string;
  tier: 'free' | 'premium';
  xp: number;
  xpToNext: number;
  streak: number;
  avatarSrc?: string | null;
  avatarColor?: string;
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
