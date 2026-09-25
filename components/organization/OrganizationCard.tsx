'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { adminFetch } from '@/components/admin/shared';

interface OrganizationMe {
  organization: { id: number; name: string; isDefault: boolean; role: string } | null;
  groups: { id: number; name: string }[];
  invitations: { id: number; organizationName: string }[];
}

/** The learner's own organization and groups. Invitations are answered on their own page. */
export function OrganizationCard() {
  const [data, setData] = useState<OrganizationMe | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminFetch<OrganizationMe>('/api/organization/me')
      .then((row) => { if (!cancelled) setData(row); })
      .catch(() => { if (!cancelled) setData(null); });
    return () => { cancelled = true; };
  }, []);

  if (!data?.organization && !(data?.invitations.length)) return null;

  return (
    <Card className="mb-6">
      <p className="text-sm font-semibold text-dojo-text-primary">Organization</p>
      {data?.organization && (
        <p className="mt-1 text-sm text-dojo-text-muted">
          {data.organization.name}
          {data.groups.length > 0 ? ` · ${data.groups.map((group) => group.name).join(', ')}` : ''}
        </p>
      )}
      {data && data.invitations.length > 0 && (
        <Link href="/organization/invitations" className="mt-3 inline-block text-sm font-medium text-dojo-accent">
          {data.invitations.length === 1 ? '1 invitation waiting' : `${data.invitations.length} invitations waiting`}
        </Link>
      )}
    </Card>
  );
}
