import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AuthScreen } from '@/components/auth/AuthScreen';

export const metadata: Metadata = {
  title: 'Admin sign in · AI DOJO',
};

/**
 * Reachable only by typing the URL — nothing links here.
 *
 * The page itself grants nothing: password and Google take the same
 * credentials as every other door, and the promotion behind them is decided
 * by `ADMIN_EMAILS` server-side. Password goes through
 * `POST /api/auth/admin/claim`; Google is claimed in the OAuth callback.
 * Someone who finds this URL and signs in with a learner account gets sent
 * to `/home` like any other learner.
 */
export default function AdminSignInPage() {
  return (
    <Suspense fallback={null}>
      <AuthScreen role="admin" mode="signin" />
    </Suspense>
  );
}
