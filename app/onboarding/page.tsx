import { redirect } from 'next/navigation';
import { getUserRoleReadOnly } from '@/lib/auth/server';

export default async function OnboardingPage() {
  const role = await getUserRoleReadOnly();
  if (!role) redirect('/auth/signup');
  if (role === 'tutor') redirect('/onboarding/tutor/welcome');
  redirect('/onboarding/welcome');
}
