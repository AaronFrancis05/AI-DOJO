import { redirect } from 'next/navigation';
import { OrganizationConsole } from '@/components/organization/OrganizationConsole';
import { readOwnOrgAdmin } from '@/lib/organizations/access';

export default async function OrganizationPage() {
  const admin = await readOwnOrgAdmin();
  if (!admin) redirect('/home');
  return <OrganizationConsole />;
}
