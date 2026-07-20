'use client';

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';

export interface UserAvatarRow {
  id: number;
  userId: string;
  avatarUrl: string;
  thumbnailUrl: string | null;
  isSelected: boolean;
  source: string;
  createdAt: string;
}

interface AvatarContextValue {
  avatars: UserAvatarRow[];
  selectedAvatar: UserAvatarRow | null;
  loading: boolean;
  selectAvatar: (id: number) => Promise<void>;
  addAvatar: (avatarUrl: string, thumbnailUrl?: string | null) => Promise<void>;
  deleteAvatar: (id: number) => Promise<void>;
  refresh: () => Promise<void>;
}

const AvatarContext = createContext<AvatarContextValue | null>(null);

export function AvatarProvider({ children }: { children: ReactNode }) {
  const [avatars, setAvatars] = useState<UserAvatarRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAvatars = useCallback(async () => {
    try {
      const res = await fetch('/api/user/avatars');
      if (!res.ok) return;
      const data = await res.json();
      if (data.success) setAvatars(data.avatars);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAvatars(); }, [fetchAvatars]);

  const selectedAvatar = avatars.find(a => a.isSelected) ?? null;

  const selectAvatar = useCallback(async (id: number) => {
    setAvatars(prev => prev.map(a => ({ ...a, isSelected: a.id === id })));
    try {
      const res = await fetch(`/api/user/avatars/${id}/select`, { method: 'PATCH' });
      if (!res.ok) throw new Error('Failed');
    } catch {
      await fetchAvatars();
    }
  }, [fetchAvatars]);

  const addAvatar = useCallback(async (avatarUrl: string, thumbnailUrl?: string | null) => {
    const optimistic: UserAvatarRow = {
      id: -Date.now(),
      userId: '',
      avatarUrl,
      thumbnailUrl: thumbnailUrl ?? null,
      isSelected: true,
      source: 'avaturn',
      createdAt: new Date().toISOString(),
    };
    setAvatars(prev => prev.map(a => ({ ...a, isSelected: false })).concat(optimistic));
    try {
      const res = await fetch('/api/user/avatars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarUrl, thumbnailUrl }),
      });
      if (!res.ok) throw new Error('Failed');
      await fetchAvatars();
    } catch {
      await fetchAvatars();
    }
  }, [fetchAvatars]);

  const deleteAvatar = useCallback(async (id: number) => {
    const deleted = avatars.find(a => a.id === id);
    setAvatars(prev => prev.filter(a => a.id !== id));
    try {
      const res = await fetch(`/api/user/avatars/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed');
    } catch {
      await fetchAvatars();
    }
  }, [avatars, fetchAvatars]);

  return (
    <AvatarContext.Provider value={{ avatars, selectedAvatar, loading, selectAvatar, addAvatar, deleteAvatar, refresh: fetchAvatars }}>
      {children}
    </AvatarContext.Provider>
  );
}

export function useAvatar(): AvatarContextValue {
  const ctx = useContext(AvatarContext);
  if (!ctx) throw new Error('useAvatar must be used within AvatarProvider');
  return ctx;
}

export function useCurrentAvatar(): string | null {
  const ctx = useContext(AvatarContext);
  return ctx?.selectedAvatar?.thumbnailUrl ?? ctx?.selectedAvatar?.avatarUrl ?? null;
}

export function useCurrentAvatarModel(): string | null {
  const ctx = useContext(AvatarContext);
  return ctx?.selectedAvatar?.avatarUrl ?? null;
}
