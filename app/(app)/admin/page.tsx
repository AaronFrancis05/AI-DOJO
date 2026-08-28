import { redirect } from 'next/navigation';
import { getUserRoleReadOnly } from '@/lib/auth/server';
import { AdminConsole } from '@/components/admin/AdminConsole';

/**
 * The admin console.
 *
 * A server component so the role check happens before anything renders — the
 * (app) layout provides the shell and a role for the client to *display*
 * with, but display is not access control. Every route the console calls
 * re-checks the role through `requireRole('admin')` as well.
 *
 * A non-admin gets sent home rather than a 403 page, for the same reason
 * `requireRole` answers 404: there is no reason to confirm the console exists.
 *
 * Read-only for the same reason as the tutor console: `getUserRole` can
 * rotate the session cookie through `getAuthUser`, and a render is not
 * allowed to set one — so an expired `session_data` cookie turned the role
 * read into a redirect home rather than an answer.
 */
export default async function AdminPage() {
  const role = await getUserRoleReadOnly();
  if (role !== 'admin') redirect('/home');

  return <AdminConsole />;
}
