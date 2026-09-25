import { redirect } from 'next/navigation';
import { InvitationsPanel } from '@/components/organization/InvitationsPanel';
import { getAuthUserReadOnly } from '@/lib/auth/server';

export default async function OrganizationInvitationsPage() {
  const user = await getAuthUserReadOnly();
  if (!user?.id) redirect('/auth/signin');
  return <InvitationsPanel />;
}
