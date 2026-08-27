'use client';

import { createContext, useContext, useEffect, ReactNode } from 'react';
import { useRoleplaySession, UseRoleplaySessionReturn } from './useRoleplaySession';
import { prewarmRecognizer, destroyRecognizer } from '@/lib/roleplay/pronunciation';
import { getBCP47 } from '@/lib/language';

const RoleplaySessionCtx = createContext<UseRoleplaySessionReturn | null>(null);

export function RoleplaySessionProvider({ sessionId, children }: { sessionId: number; children: ReactNode }) {
  const session = useRoleplaySession(sessionId);
  const targetLanguage = session.session?.targetLanguage;

  // The recognizer (Azure token, websocket, microphone stream and capture
  // graph) belongs to the SESSION, not to whichever view is mounted. Building
  // it here means the first mic press has nothing left to wait for, and the
  // voice ⇄ avatar tab switch no longer destroys and rebuilds the whole thing
  // — a cold press after a switch used to pay the full acquisition again.
  useEffect(() => {
    if (!targetLanguage) return;
    prewarmRecognizer(getBCP47(targetLanguage, 'stt')).catch(() => {
      // Retried by the next explicit start(); a failure here costs warmth, not capture.
    });
  }, [targetLanguage]);

  // Leaving the session is the one point at which the microphone must actually
  // be released, or the browser's recording indicator stays lit.
  useEffect(() => {
    return () => { destroyRecognizer(); };
  }, []);

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
