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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    adminFetch<OrganizationMe>('/api/organization/me')
      .then((row) => { if (!cancelled) setData(row); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (!loading && !data?.organization && !(data?.invitations.length)) return null;

  return (
    <Card className="mb-6">
      {(loading || data?.organization) && (
        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium text-dojo-text-muted">Organization</p>
            {loading ? (
              <p className="mt-1 text-sm text-dojo-text-muted">Loading…</p>
            ) : (
              <p className="mt-1 text-sm font-semibold text-dojo-text-primary">{data?.organization?.name}</p>
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-dojo-text-muted">Groups</p>
            {loading ? (
              <p className="mt-1 text-sm text-dojo-text-muted">Loading…</p>
            ) : data && data.groups.length > 0 ? (
              <ul className="mt-1 space-y-1">
                {data.groups.map((group) => (
                  <li key={group.id} className="text-sm font-semibold text-dojo-text-primary">{group.name}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-dojo-text-muted">None</p>
            )}
          </div>
        </div>
      )}
      {data && data.invitations.length > 0 && (
        <Link href="/organization/invitations" className="mt-3 inline-block text-sm font-medium text-dojo-accent">
          {data.invitations.length === 1 ? '1 invitation waiting' : `${data.invitations.length} invitations waiting`}
        </Link>
      )}
    </Card>
  );
}
