'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Toggle } from '@/components/ui/Toggle';
import { HYBRID_ENABLED } from '@/lib/tutors/config';
import { adminFetch, adminInputClass, EmptyState, Loading } from '@/components/admin/shared';

interface OrgRow {
  id: number;
  name: string;
  slug: string;
  isDefault: boolean;
  status: string;
  memberCount: number;
  hybridTutoringEnabled: boolean;
}

export function OrganizationsPanel({ onError }: { onError: (msg: string) => void }) {
  const [rows, setRows] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [emails, setEmails] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    return adminFetch<{ organizations: OrgRow[] }>('/api/admin/organizations')
      .then((data) => {
        setRows(data.organizations ?? []);
        onError('');
      })
      .catch((e) => onError(e instanceof Error ? e.message : 'Failed to load organizations'))
      .finally(() => setLoading(false));
  }, [onError]);

  useEffect(() => {
    let cancelled = false;
    adminFetch<{ organizations: OrgRow[] }>('/api/admin/organizations')
      .then((data) => {
        if (cancelled) return;
        setRows(data.organizations ?? []);
        onError('');
      })
      .catch((e) => {
        if (!cancelled) onError(e instanceof Error ? e.message : 'Failed to load organizations');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [onError]);

  async function createOrg() {
    setBusy(true);
    onError('');
    try {
      await adminFetch('/api/admin/organizations', {
        method: 'POST',
        body: { name, ...(slug.trim() ? { slug: slug.trim() } : {}) },
      });
      setName('');
      setSlug('');
      setLoading(true);
      await load();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not create the organization');
    } finally {
      setBusy(false);
    }
  }

  async function appoint(organizationId: number) {
    const email = emails[organizationId]?.trim() ?? '';
    if (!email) return;
    setBusy(true);
    onError('');
    try {
      await adminFetch(`/api/admin/organizations/${organizationId}/admins`, { method: 'POST', body: { email } });
      setEmails((current) => ({ ...current, [organizationId]: '' }));
      setLoading(true);
      await load();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not appoint an administrator');
    } finally {
      setBusy(false);
    }
  }

  /** The per-organization pilot switch for hybrid tutoring (PLAN.md 4.5). */
  async function setHybrid(organizationId: number, enabled: boolean) {
    setBusy(true);
    onError('');
    try {
      await adminFetch(`/api/admin/organizations/${organizationId}`, {
        method: 'PATCH',
        body: { hybridTutoringEnabled: enabled },
      });
      await load();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not update the organization');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading />;

  return (
    <div className="space-y-4">
      <Card className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <input className={adminInputClass} placeholder="Organization name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className={adminInputClass} placeholder="Slug (optional)" value={slug} onChange={(e) => setSlug(e.target.value)} />
        <Button disabled={busy || !name.trim()} onClick={createOrg}>Create</Button>
      </Card>

      {rows.length === 0 ? <EmptyState>No organizations yet.</EmptyState> : rows.map((org) => (
        <Card key={org.id}>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-dojo-text-primary">{org.name}</p>
            {org.isDefault && <Badge variant="accent">Public</Badge>}
            <span className="text-xs text-dojo-text-muted">{org.slug}</span>
            <span className="text-xs text-dojo-text-muted">{org.memberCount} {org.memberCount === 1 ? 'member' : 'members'}</span>
            {HYBRID_ENABLED && (
              <div className="ms-auto">
                <Toggle
                  enabled={org.hybridTutoringEnabled}
                  onChange={(next) => { void setHybrid(org.id, next); }}
                  label="Hybrid tutoring"
                />
              </div>
            )}
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              className={adminInputClass}
              type="email"
              placeholder="Learner email to appoint as admin"
              value={emails[org.id] ?? ''}
              onChange={(e) => setEmails((current) => ({ ...current, [org.id]: e.target.value }))}
            />
            <Button
              variant="secondary"
              disabled={busy || !(emails[org.id] ?? '').trim()}
              onClick={() => appoint(org.id)}
            >
              Appoint admin
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
