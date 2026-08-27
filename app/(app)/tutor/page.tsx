import { redirect } from 'next/navigation';
import { getUserRole } from '@/lib/auth/server';
import { TutorConsole } from '@/components/tutors/TutorConsole';
import { TUTORS_ENABLED } from '@/lib/tutors/config';

/**
 * The teaching console.
 *
 * A server component so the role check happens before anything renders — the
 * (app) layout gives the client a role to *display* with, but display is not
 * access control. Every route the console calls re-checks through
 * `requireRole('tutor')` as well.
 *
 * A learner is sent home rather than shown a 403, for the same reason
 * `requireRole` answers 404: there is no reason to confirm the console
 * exists. `admin` satisfies `tutor` (see satisfiesRole in lib/auth/roles.ts),
 * so an admin can open it without changing role.
 */
export default async function TutorPage() {
  if (!TUTORS_ENABLED) redirect('/home');

  const role = await getUserRole();
  if (role !== 'tutor' && role !== 'admin') redirect('/home');

  return <TutorConsole />;
}
