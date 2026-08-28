import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AuthScreen } from '@/components/auth/AuthScreen';

export const metadata: Metadata = {
  title: 'Create an admin account · AI DOJO',
};

/**
 * Reachable only by typing the URL.
 *
 * The account it creates is an ordinary one. It becomes an admin only if
 * `POST /api/auth/admin/claim` finds the address in `ADMIN_EMAILS` — an
 * environment variable a self-signup cannot reach. Anyone else who completes
 * this form ends up with a learner account and is told so.
 */
export default function AdminSignUpPage() {
  return (
    <Suspense fallback={null}>
      <AuthScreen role="admin" mode="signup" />
    </Suspense>
  );
}
