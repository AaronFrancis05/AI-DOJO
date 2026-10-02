import { redirect } from 'next/navigation';
import { getUserRoleReadOnly } from '@/lib/auth/server';

/**
 * The learner wizard is only for a signed-in account that has not finished
 * setup. Guests used to walk it and create an account on the last step;
 * tryout now sends them to `/auth/signup` instead, so this gate is what
 * makes that invariant hold if someone still opens the URL.
 */
export default async function LearnerOnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const role = await getUserRoleReadOnly();
  if (!role) redirect('/auth/signup');
  if (role === 'tutor') redirect('/onboarding/tutor/welcome');
  return children;
}
