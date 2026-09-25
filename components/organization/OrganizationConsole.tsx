'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Tabs } from '@/components/ui/Tabs';
import { usePageTitle } from '@/lib/hooks/PageTitleContext';
import { adminFetch, adminInputClass, EmptyState, Loading } from '@/components/admin/shared';

interface Member {
  id: string;
  name: string;
  email: string;
  status: string;
  membershipRole: string;
  groups: { id: number; name: string }[];
}

interface GroupRow {
  id: number;
  name: string;
  memberCount: number;
}

interface OrgInvitation {
  id: number;
  email: string;
  name: string;
  createdAt: string;
}

interface ProgressRow {
  userId: string;
  name: string;
  email: string;
  courseTitle: string | null;
  targetLanguage: string | null;
  status: string | null;
  lessonsCompleted: number | null;
  xpEarned: number | null;
  lastActivityAt: string | null;
}

const TABS = [
  { id: 'people', label: 'People' },
  { id: 'groups', label: 'Groups' },
  { id: 'invitations', label: 'Invitations' },
  { id: 'progress', label: 'Progress' },
];

export function OrganizationConsole() {
  usePageTitle('Organization');
  const [tab, setTab] = useState('people');
  const [error, setError] = useState('');
  const [orgName, setOrgName] = useState('');
  const [isDefault, setIsDefault] = useState(false);

  const [members, setMembers] = useState<Member[]>([]);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [invitations, setInvitations] = useState<OrgInvitation[]>([]);
  const [progress, setProgress] = useState<ProgressRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupName, setGroupName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [busy, setBusy] = useState(false);

  const loadRoster = useCallback(() => {
    return adminFetch<{ organization: { name: string; isDefault: boolean }; members: Member[] }>('/api/organization/roster')
      .then((data) => {
        setOrgName(data.organization.name);
        setIsDefault(data.organization.isDefault);
        setMembers(data.members ?? []);
      });
  }, []);

  const loadGroups = useCallback(() => {
    return adminFetch<{ groups: GroupRow[] }>('/api/organization/groups')
      .then((data) => setGroups(data.groups ?? []));
  }, []);

  const loadInvitations = useCallback(() => {
    return adminFetch<{ invitations: OrgInvitation[] }>('/api/organization/invitations')
      .then((data) => setInvitations(data.invitations ?? []));
  }, []);

  const loadProgress = useCallback((filter: string) => {
    const query = filter ? `?groupId=${encodeURIComponent(filter)}` : '';
    return adminFetch<{ progress: ProgressRow[]; groups: GroupRow[] }>(`/api/organization/progress${query}`)
      .then((data) => {
        setProgress(data.progress ?? []);
        setGroups(data.groups ?? []);
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const job = tab === 'groups'
      ? Promise.all([loadRoster(), loadGroups()])
      : tab === 'invitations'
        ? Promise.all([loadRoster(), loadInvitations()])
        : tab === 'progress'
          ? Promise.all([loadRoster(), loadProgress(groupFilter)])
          : loadRoster();
    job
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tab, groupFilter, loadGroups, loadInvitations, loadProgress, loadRoster]);

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await task();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl p-6 lg:p-10">
      <div className="mb-8">
        <h1 className="hidden md:block text-3xl font-bold tracking-tight leading-none text-dojo-text-primary">
          {orgName || 'Organization'}
        </h1>
        <p className="mt-2 text-base leading-relaxed text-dojo-text-muted">
          {isDefault
            ? 'People here can be invited into another organization.'
            : 'Retire someone before another organization can invite them.'}
        </p>
      </div>

      {error && (
        <p role="alert" className="mb-6 text-sm text-dojo-danger">{error}</p>
      )}

      <Tabs
        tabs={TABS}
        defaultTab="people"
        onChange={(next) => { setError(''); setLoading(true); setTab(next); }}
        renderPanel={(panel) => (
          <div className="pt-6">
            {loading ? <Loading /> : panel === 'people' ? (
              <PeopleTab
                members={members}
                isDefault={isDefault}
                busy={busy}
                onRetire={(userId) => run(async () => { await adminFetch('/api/organization/retire', { method: 'POST', body: { userId } }); await loadRoster(); })}
              />
            ) : panel === 'groups' ? (
              <GroupsTab
                groups={groups}
                members={members}
                groupName={groupName}
                setGroupName={setGroupName}
                busy={busy}
                onCreate={() => run(async () => {
                  await adminFetch('/api/organization/groups', { method: 'POST', body: { name: groupName } });
                  setGroupName('');
                  await loadGroups();
                })}
                onDelete={(id) => run(async () => { await adminFetch(`/api/organization/groups/${id}`, { method: 'DELETE' }); await loadGroups(); })}
                onRename={(id, name) => run(async () => {
                  await adminFetch(`/api/organization/groups/${id}`, { method: 'PATCH', body: { name } });
                  await Promise.all([loadGroups(), loadRoster()]);
                })}
                onAdd={(groupId, userId) => run(async () => {
                  await adminFetch(`/api/organization/groups/${groupId}/members`, { method: 'POST', body: { userId } });
                  await Promise.all([loadGroups(), loadRoster()]);
                })}
                onRemove={(groupId, userId) => run(async () => {
                  await adminFetch(`/api/organization/groups/${groupId}/members?userId=${encodeURIComponent(userId)}`, { method: 'DELETE' });
                  await Promise.all([loadGroups(), loadRoster()]);
                })}
              />
            ) : panel === 'invitations' ? (
              <InvitationsTab
                invitations={invitations}
                email={inviteEmail}
                setEmail={setInviteEmail}
                busy={busy}
                isDefault={isDefault}
                onInvite={() => run(async () => {
                  await adminFetch('/api/organization/invitations', { method: 'POST', body: { email: inviteEmail } });
                  setInviteEmail('');
                  await loadInvitations();
                })}
                onRevoke={(id) => run(async () => {
                  await adminFetch(`/api/organization/invitations/${id}/revoke`, { method: 'POST' });
                  await loadInvitations();
                })}
              />
            ) : (
              <ProgressTab
                rows={progress}
                groups={groups}
                groupFilter={groupFilter}
                onFilter={(value) => { setLoading(true); setGroupFilter(value); }}
              />
            )}
          </div>
        )}
      />
    </div>
  );
}

function PeopleTab({
  members,
  isDefault,
  busy,
  onRetire,
}: {
  members: Member[];
  isDefault: boolean;
  busy: boolean;
  onRetire: (userId: string) => void;
}) {
  if (members.length === 0) return <EmptyState>No one is in this organization yet.</EmptyState>;
  return (
    <div className="space-y-3">
      {members.map((member) => (
        <Card key={member.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-semibold text-dojo-text-primary">{member.name || member.email}</p>
              {member.membershipRole === 'admin' && <Badge variant="accent">Admin</Badge>}
              {member.status !== 'active' && <Badge variant="outline">{member.status}</Badge>}
            </div>
            <p className="mt-1 truncate text-xs text-dojo-text-muted">{member.email}</p>
            {member.groups.length > 0 && (
              <p className="mt-1 text-xs text-dojo-text-muted">{member.groups.map((group) => group.name).join(', ')}</p>
            )}
          </div>
          {!isDefault && (
            <Button size="sm" variant="danger" disabled={busy} onClick={() => onRetire(member.id)}>
              Retire
            </Button>
          )}
        </Card>
      ))}
    </div>
  );
}

function GroupsTab({
  groups,
  members,
  groupName,
  setGroupName,
  busy,
  onCreate,
  onDelete,
  onRename,
  onAdd,
  onRemove,
}: {
  groups: GroupRow[];
  members: Member[];
  groupName: string;
  setGroupName: (value: string) => void;
  busy: boolean;
  onCreate: () => void;
  onDelete: (id: number) => void;
  onRename: (id: number, name: string) => Promise<boolean>;
  onAdd: (groupId: number, userId: string) => void;
  onRemove: (groupId: number, userId: string) => void;
}) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  return (
    <div className="space-y-4">
      <Card className="flex flex-col gap-3 sm:flex-row">
        <input
          className={adminInputClass}
          placeholder="Group name"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
        />
        <Button disabled={busy || !groupName.trim()} onClick={onCreate}>Add group</Button>
      </Card>
      {groups.length === 0 ? <EmptyState>No groups yet. People can belong to the organization without one.</EmptyState> : groups.map((group) => {
        const inGroup = new Set(members.filter((member) => member.groups.some((item) => item.id === group.id)).map((member) => member.id));
        const available = members.filter((member) => !inGroup.has(member.id));
        return (
          <Card key={group.id}>
            <div className="flex items-center justify-between gap-3">
              {editingId === group.id ? (
                <input
                  className={`${adminInputClass} min-w-0 flex-1`}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  aria-label="Group name"
                />
              ) : (
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-dojo-text-primary">{group.name}</p>
                  <p className="mt-1 text-xs text-dojo-text-muted">{group.memberCount} {group.memberCount === 1 ? 'person' : 'people'}</p>
                </div>
              )}
              <div className="flex shrink-0 gap-2">
                {editingId === group.id ? (
                  <>
                    <Button
                      size="sm"
                      disabled={busy || !draft.trim()}
                      onClick={async () => {
                        if (draft.trim() === group.name) {
                          setEditingId(null);
                          return;
                        }
                        const saved = await onRename(group.id, draft);
                        if (saved) setEditingId(null);
                      }}
                    >
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditingId(null)}>Cancel</Button>
                  </>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => { setEditingId(group.id); setDraft(group.name); }}
                    >
                      Rename
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => onDelete(group.id)}>Remove</Button>
                  </>
                )}
              </div>
            </div>
            <ul className="mt-4 space-y-2">
              {members.filter((member) => inGroup.has(member.id)).map((member) => (
                <li key={member.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-dojo-text-primary">{member.name || member.email}</span>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => onRemove(group.id, member.id)}>Remove</Button>
                </li>
              ))}
            </ul>
            {available.length > 0 && (
              <label className="mt-4 block text-xs text-dojo-text-muted">
                Add someone
                <select
                  className={`${adminInputClass} mt-1`}
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) onAdd(group.id, e.target.value);
                    e.target.value = '';
                  }}
                >
                  <option value="">Choose a member</option>
                  {available.map((member) => (
                    <option key={member.id} value={member.id}>{member.name || member.email}</option>
                  ))}
                </select>
              </label>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function InvitationsTab({
  invitations,
  email,
  setEmail,
  busy,
  isDefault,
  onInvite,
  onRevoke,
}: {
  invitations: OrgInvitation[];
  email: string;
  setEmail: (value: string) => void;
  busy: boolean;
  isDefault: boolean;
  onInvite: () => void;
  onRevoke: (id: number) => void;
}) {
  return (
    <div className="space-y-4">
      {isDefault ? (
        <EmptyState>Invitations are sent from the organization someone is joining.</EmptyState>
      ) : (
        <Card className="flex flex-col gap-3 sm:flex-row">
          <input
            className={adminInputClass}
            type="email"
            placeholder="Learner email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button disabled={busy || !email.trim()} onClick={onInvite}>Send invitation</Button>
        </Card>
      )}
      {invitations.length === 0 ? null : invitations.map((invitation) => (
        <Card key={invitation.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-dojo-text-primary">{invitation.name || invitation.email}</p>
            <p className="mt-1 text-xs text-dojo-text-muted">{invitation.email}</p>
          </div>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => onRevoke(invitation.id)}>Revoke</Button>
        </Card>
      ))}
    </div>
  );
}

function ProgressTab({
  rows,
  groups,
  groupFilter,
  onFilter,
}: {
  rows: ProgressRow[];
  groups: GroupRow[];
  groupFilter: string;
  onFilter: (value: string) => void;
}) {
  return (
    <div className="space-y-4">
      <label className="block max-w-xs text-xs text-dojo-text-muted">
        Group
        <select className={`${adminInputClass} mt-1`} value={groupFilter} onChange={(e) => onFilter(e.target.value)}>
          <option value="">Everyone</option>
          {groups.map((group) => (
            <option key={group.id} value={String(group.id)}>{group.name}</option>
          ))}
        </select>
      </label>
      {rows.length === 0 ? <EmptyState>No progress in this view yet.</EmptyState> : (
        <div className="space-y-3">
          {rows.map((row, index) => (
            <Card key={`${row.userId}-${row.courseTitle ?? 'none'}-${index}`}>
              <p className="text-sm font-semibold text-dojo-text-primary">{row.name || row.email}</p>
              <p className="mt-1 text-xs text-dojo-text-muted">
                {row.courseTitle
                  ? `${row.courseTitle} · ${row.targetLanguage} · ${row.lessonsCompleted ?? 0} lessons · ${row.xpEarned ?? 0} XP`
                  : 'No course yet'}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
