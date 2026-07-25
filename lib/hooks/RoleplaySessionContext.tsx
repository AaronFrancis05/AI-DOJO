'use client';

import { createContext, useContext, ReactNode } from 'react';
import { useRoleplaySession, UseRoleplaySessionReturn } from './useRoleplaySession';

const RoleplaySessionCtx = createContext<UseRoleplaySessionReturn | null>(null);

export function RoleplaySessionProvider({ sessionId, children }: { sessionId: number; children: ReactNode }) {
  const session = useRoleplaySession(sessionId);
  return (
    <RoleplaySessionCtx.Provider value={session}>
      {children}
    </RoleplaySessionCtx.Provider>
  );
}

export function useRoleplaySessionContext(): UseRoleplaySessionReturn {
  const ctx = useContext(RoleplaySessionCtx);
  if (!ctx) throw new Error('useRoleplaySessionContext must be used within RoleplaySessionProvider');
  return ctx;
}
