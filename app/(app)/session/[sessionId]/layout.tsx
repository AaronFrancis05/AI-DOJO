'use client';

import { useParams } from 'next/navigation';
import { RoleplaySessionProvider } from '@/lib/hooks/RoleplaySessionContext';

export default function SessionLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const sessionId = Number(params.sessionId);
  if (!Number.isFinite(sessionId)) return <>{children}</>;
  return (
    <RoleplaySessionProvider sessionId={sessionId}>
      {children}
    </RoleplaySessionProvider>
  );
}
