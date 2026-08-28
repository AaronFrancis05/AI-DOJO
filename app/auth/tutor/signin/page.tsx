import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AuthScreen } from '@/components/auth/AuthScreen';

export const metadata: Metadata = {
  title: 'Tutor sign in · AI DOJO',
};

/**
 * The tutor door.
 *
 * The credentials are the same ones the learner form takes — there is one
 * account system — so this page grants nothing on its own. What it fixes is
 * the returning tutor who signed in on the learner page and landed on a
 * learner dashboard: `users.role` decides the landing either way, and this
 * page just says out loud that teaching accounts sign in here.
 */
export default function TutorSignInPage() {
  return (
    <Suspense fallback={null}>
      <AuthScreen role="tutor" mode="signin" />
    </Suspense>
  );
}
