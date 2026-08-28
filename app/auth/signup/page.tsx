import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AuthScreen } from '@/components/auth/AuthScreen';

export const metadata: Metadata = {
  title: 'Create your account · AI DOJO',
};

/** The default sign-up. The Tutor tab leads to the application form. */
export default function SignUpPage() {
  return (
    <Suspense fallback={null}>
      <AuthScreen role="learner" mode="signup" />
    </Suspense>
  );
}
