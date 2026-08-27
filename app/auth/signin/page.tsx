import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AuthScreen } from '@/components/auth/AuthScreen';

export const metadata: Metadata = {
  title: 'Sign in · AI DOJO',
};

/**
 * The default door. A learner form with a Tutor tab beside it — a tutor is one
 * click away, an admin is not linked at all.
 *
 * Where a successful sign-in *lands* is decided by `users.role`, not by this
 * page: see `landAfterSignIn` in AuthScreen.
 */
export default function SignInPage() {
  // `useSearchParams` inside — the boundary keeps the first paint from being
  // blocked on it.
  return (
    <Suspense fallback={null}>
      <AuthScreen role="learner" mode="signin" />
    </Suspense>
  );
}
