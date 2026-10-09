import { redirect } from 'next/navigation';
import { getUserRoleReadOnly } from '@/lib/auth/server';
import { TutorVettingChecklist } from '@/components/tutors/TutorVettingChecklist';
import { HYBRID_ENABLED, TUTORS_ENABLED } from '@/lib/tutors/config';

/**
 * An applicant's vetting checklist (PLAN.md 4.6). A server component for the
 * same reason as /tutor: the role check happens before anything renders, and
 * read-only so a render never rotates the session cookie.
 */
export default async function TutorVettingPage() {
  if (!TUTORS_ENABLED || !HYBRID_ENABLED) redirect('/home');

  const role = await getUserRoleReadOnly();
  if (role !== 'tutor' && role !== 'admin') redirect('/home');

  return <TutorVettingChecklist />;
}
