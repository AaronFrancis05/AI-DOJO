import { redirect } from 'next/navigation';
import { getUserRole } from '@/lib/auth/server';
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
 */
export default async function AdminPage() {
  const role = await getUserRole();
  if (role !== 'admin') redirect('/home');

  return <AdminConsole />;
}
