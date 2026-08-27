import { redirect } from 'next/navigation';
import { getUserRoleReadOnly } from '@/lib/auth/server';
import { TutorOnboarding } from '@/components/onboarding';

/**
 * The tutor wizard, gated the same way `/tutor` is: a server component, so the
 * role is resolved before anything renders.
 *
 * A learner who finds this URL is sent to their own wizard rather than shown
 * a tutor flow that would finish onboarding without ever asking them a
 * learner question. Nobody signed in goes to `/auth` — `next` brings them
 * back here.
 */
export default async function TutorOnboardingStepPage({
  params,
}: {
  params: Promise<{ step: string }>;
}) {
  const { step } = await params;
  const role = await getUserRoleReadOnly();

  if (!role) redirect(`/auth?next=${encodeURIComponent('/onboarding/tutor/welcome')}`);
  if (role === 'learner') redirect('/onboarding/level');

  return <TutorOnboarding step={step} />;
}
