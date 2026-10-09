import { Suspense } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getUserRoleReadOnly } from '@/lib/auth/server';

/**
 * The learner wizard is for a signed-in account that has not finished setup.
 * Guests used to walk it and create an account on the last step; tryout now
 * sends them to `/auth/signup` instead, so this gate is what makes that
 * invariant hold if someone still opens the URL.
 *
 * `?preview=1` is the exception: a dry run of the screens that never POSTs.
 * proxy.ts copies that query onto `x-onboarding-preview` because a layout
 * cannot read searchParams. Development also lets a guest in so the flow can
 * be reviewed locally without minting an account.
 */
export default async function LearnerOnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const role = await getUserRoleReadOnly();
  if (role === 'tutor') redirect('/onboarding/tutor/welcome');

  const headerStore = await headers();
  const isPreview = headerStore.get('x-onboarding-preview') === '1';
  const allowGuest = isPreview || process.env.NODE_ENV !== 'production';

  if (!role && !allowGuest) redirect('/auth/signup');

  return <Suspense fallback={null}>{children}</Suspense>;
}
