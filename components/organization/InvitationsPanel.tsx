'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { usePageTitle } from '@/lib/hooks/PageTitleContext';
import { adminFetch, EmptyState, Loading } from '@/components/admin/shared';

interface Invitation {
  id: number;
  organizationName: string;
  createdAt: string;
}

export function InvitationsPanel() {
  usePageTitle('Invitations');
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(() => {
    return adminFetch<{ invitations: Invitation[] }>('/api/organization/me')
      .then((data) => {
        setInvitations(data.invitations ?? []);
        setError('');
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load invitations'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    adminFetch<{ invitations: Invitation[] }>('/api/organization/me')
      .then((data) => {
        if (cancelled) return;
        setInvitations(data.invitations ?? []);
        setError('');
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load invitations');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function respond(id: number, action: 'accept' | 'decline') {
    setBusyId(id);
    setError('');
    try {
      await adminFetch(`/api/organization/invitations/${id}`, { method: 'POST', body: { action } });
      setLoading(true);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update the invitation');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl p-6 lg:p-10">
      <div className="mb-8">
        <h1 className="hidden md:block text-3xl font-bold tracking-tight leading-none text-dojo-text-primary">
          Invitations
        </h1>
        <p className="mt-2 text-base leading-relaxed text-dojo-text-muted">
          Accepting an invitation moves you into that organization.
        </p>
      </div>

      {error && (
        <p role="alert" className="mb-6 text-sm text-dojo-danger">{error}</p>
      )}

      {loading ? <Loading /> : invitations.length === 0 ? (
        <EmptyState>No invitations waiting.</EmptyState>
      ) : (
        <div className="space-y-3">
          {invitations.map((invitation) => (
            <Card key={invitation.id} className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-dojo-text-primary">{invitation.organizationName}</p>
                <p className="mt-1 text-xs text-dojo-text-muted">
                  {new Date(invitation.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  loading={busyId === invitation.id}
                  onClick={() => respond(invitation.id, 'accept')}
                >
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busyId === invitation.id}
                  onClick={() => respond(invitation.id, 'decline')}
                >
                  Decline
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
