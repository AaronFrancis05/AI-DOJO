import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AuthScreen } from '@/components/auth/AuthScreen';

export const metadata: Metadata = {
  title: 'Admin sign in · AI DOJO',
};

/**
 * Reachable only by typing the URL — nothing links here.
 *
 * The page itself grants nothing: it takes the same credentials as every other
 * door, and the promotion behind it is decided by `ADMIN_EMAILS` server-side
 * in `POST /api/auth/admin/claim`. Someone who finds this URL and signs in
 * with a learner account gets sent to `/home` like any other learner.
 */
export default function AdminSignInPage() {
  return (
    <Suspense fallback={null}>
      <AuthScreen role="admin" mode="signin" />
    </Suspense>
  );
}
