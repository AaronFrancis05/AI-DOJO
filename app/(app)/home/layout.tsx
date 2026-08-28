import { redirect } from 'next/navigation';
import { getUserRoleReadOnly } from '@/lib/auth/server';

/**
 * Where a tutor lands.
 *
 * `/home` is the learner dashboard — XP, streak, scenario history, daily
 * practice goal — and it is also the default destination of `/auth` and of
 * `/tutor` when the role check fails. A tutor arriving here gets a dashboard
 * of permanent zeroes, so send them to the console that is actually theirs.
 *
 * Only `tutor`: `admin` satisfies every role and keeps both sides, and the
 * teaching nav offers no link back here, so this is the one place the
 * redirect has to live.
 */
export default async function HomeLayout({ children }: { children: React.ReactNode }) {
  const role = await getUserRoleReadOnly();
  if (role === 'tutor') redirect('/tutor');

  return children;
}
