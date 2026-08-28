import { redirect } from 'next/navigation';

/** Mirrors `/onboarding` → first step, for the tutor wizard. */
export default function TutorOnboardingPage() {
  redirect('/onboarding/tutor/welcome');
}
