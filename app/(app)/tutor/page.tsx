import { redirect } from 'next/navigation';
import { getUserRoleReadOnly } from '@/lib/auth/server';
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
 * Read-only, and it has to be: `getUserRole` goes through `getAuthUser`, which
 * lets Neon Auth rotate the session cookie. A render may not set a cookie, so
 * the moment the short-lived `session_data` cookie expired the role read blew
 * up, a tutor was bounced to /home, and `home/layout.tsx` — which asks the
 * same question the read-only way — sent them straight back here. That is the
 * /tutor ↔ /home ping-pong, not a role problem.
 *
 * A learner is sent home rather than shown a 403, for the same reason
 * `requireRole` answers 404: there is no reason to confirm the console
 * exists. `admin` satisfies `tutor` (see satisfiesRole in lib/auth/roles.ts),
 * so an admin can open it without changing role.
 */
export default async function TutorPage() {
  if (!TUTORS_ENABLED) redirect('/home');

  const role = await getUserRoleReadOnly();
  if (role !== 'tutor' && role !== 'admin') redirect('/home');

  return <TutorConsole />;
}
