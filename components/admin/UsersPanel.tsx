'use client';

/* ───────────────────────────────────────────────
   Admin user management: search and filter, change role, revoke and restore
   access, soft-delete, and the guarded permanent purge. Every action goes to
   /api/admin/users*, which re-checks requireRole('admin') and re-applies the
   self-protection guards — the disabled buttons here are a courtesy.
   ─────────────────────────────────────────────── */

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useUser } from '@/lib/auth/user-context';
import { USER_ROLES, type UserRole } from '@/lib/auth/roles';
import { ACCOUNT_STATUSES } from '@/lib/auth/account-status';
import { getNativeLangName, getTargetLangConfig } from '@/lib/language';
import { useLanguageCatalog } from '@/lib/language-context';
import { EmptyState, Loading, adminFetch, adminInputClass } from '@/components/admin/shared';
import { Ban, RotateCcw, Search, Trash2, UserPlus } from 'lucide-react';

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  suspendedReason: string | null;
  level: string;
  tier: string;
  preferredTargetLanguage: string;
  nativeLanguage: string;
  onboardingCompletedAt: string | null;
  createdAt: string;
}

const STATUS_VARIANT: Record<string, 'success' | 'outline' | 'default'> = {
  active: 'success',
  suspended: 'outline',
  deleted: 'default',
};

export function UsersPanel({ onError }: { onError: (msg: string) => void }) {
  const me = useUser();
  const catalog = useLanguageCatalog();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const filterKey = JSON.stringify({ query, roleFilter, statusFilter, reloadKey });

  useEffect(() => {
    let cancelled = false;
    const { query: q, roleFilter: r, statusFilter: s } = JSON.parse(filterKey);

    // Debounced so typing a name is not a query per keystroke.
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ q });
      if (r) params.set('role', r);
      if (s) params.set('status', s);

      adminFetch<{ users: AdminUser[]; total: number }>(`/api/admin/users?${params}`)
        .then((data) => {
          if (cancelled) return;
          setUsers(data.users ?? []);
          setTotal(data.total ?? 0);
          setLoading(false);
        })
        .catch((e) => {
          if (cancelled) return;
          onError(e instanceof Error ? e.message : 'Failed to load users');
          setLoading(false);
        });
    }, 250);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [filterKey, onError]);

  const reload = useCallback(() => setReloadKey((n) => n + 1), []);

  const patch = useCallback(async (userId: string, body: Record<string, unknown>) => {
    setBusyId(userId);
    onError('');
    try {
      await adminFetch('/api/admin/users', { method: 'PATCH', body: { userId, ...body } });
      reload();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusyId(null);
    }
  }, [onError, reload]);

  const suspend = useCallback(async (u: AdminUser) => {
    const reason = window.prompt(
      `Why is ${u.name || u.email} losing access? They will be shown this.`,
      '',
    );
    // Cancel returns null; an empty string is a deliberate "no reason given".
    if (reason === null) return;
    await patch(u.id, { status: 'suspended', suspendedReason: reason });
  }, [patch]);

  const softDelete = useCallback(async (u: AdminUser) => {
    if (!window.confirm(
      `Close ${u.name || u.email}'s account?\n\nTheir sessions, grades and class enrolments are kept so other people's records stay intact — but the account is anonymised and can no longer be signed into.`,
    )) return;

    setBusyId(u.id);
    onError('');
    try {
      await adminFetch('/api/admin/users', { method: 'DELETE', body: { userId: u.id } });
      reload();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setBusyId(null);
    }
  }, [onError, reload]);

  const purge = useCallback(async (u: AdminUser) => {
    const typed = window.prompt(
      `PERMANENTLY delete ${u.email}?\n\nThis cannot be undone. Their sessions, evaluations, class enrolments and the tutor verdicts filed about them are all deleted — which changes other people's rosters and grade history too.\n\nType the account email to confirm:`,
      '',
    );
    if (!typed) return;

    setBusyId(u.id);
    onError('');
    try {
      const data = await adminFetch<{ purged: { sessions: number; classEnrollments: number } }>(
        `/api/admin/users/${u.id}/purge`,
        { method: 'POST', body: { confirmEmail: typed } },
      );
      window.alert(
        `Deleted. ${data.purged.sessions} session(s) and ${data.purged.classEnrollments} class enrolment(s) went with it.`,
      );
      reload();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Purge failed');
    } finally {
      setBusyId(null);
    }
  }, [onError, reload]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-64 flex-1 items-center gap-2 rounded-(--radius-md) border border-dojo-border bg-dojo-surface px-4 py-2 focus-within:border-dojo-accent">
          <Search className="h-4 w-4 shrink-0 text-dojo-text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full bg-transparent py-1 text-sm text-dojo-text-primary outline-none placeholder:text-dojo-text-muted/60"
          />
        </div>

        <select
          aria-label="Filter by role"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="rounded-(--radius-md) border border-dojo-border bg-dojo-surface px-3 py-2 text-sm text-dojo-text-primary outline-none focus:border-dojo-accent"
        >
          <option value="">All roles</option>
          {USER_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>

        <select
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-(--radius-md) border border-dojo-border bg-dojo-surface px-3 py-2 text-sm text-dojo-text-primary outline-none focus:border-dojo-accent"
        >
          <option value="">Any status</option>
          {ACCOUNT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>

        <Button variant="secondary" onClick={() => setShowCreate((v) => !v)}>
          <UserPlus className="h-4 w-4" /> Add
        </Button>
      </div>

      {showCreate && (
        <CreateUserForm
          catalog={catalog}
          onError={onError}
          onCreated={() => { setShowCreate(false); reload(); }}
        />
      )}

      {loading ? (
        <Loading />
      ) : users.length === 0 ? (
        <EmptyState>No users match that search.</EmptyState>
      ) : (
        <>
          <p className="text-xs text-dojo-text-muted">Showing {users.length} of {total}</p>
          <Card raised className="!p-0 overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead>
                <tr className="border-b border-dojo-border text-xs uppercase tracking-wider text-dojo-text-muted">
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Email</th>
                  <th className="px-4 py-3 font-semibold">Languages</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold">Access</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isSelf = u.id === me?.id;
                  const busy = busyId === u.id;
                  return (
                    <tr key={u.id} className="border-b border-dojo-border/60 last:border-0">
                      <td className="px-4 py-3 font-medium text-dojo-text-primary">
                        {u.name || '—'}
                        {isSelf && <span className="ml-2 text-xs text-dojo-text-muted">(you)</span>}
                      </td>
                      <td className="px-4 py-3 text-dojo-text-muted">{u.email}</td>
                      <td className="px-4 py-3 text-dojo-text-muted">
                        {getTargetLangConfig(u.preferredTargetLanguage).name}
                        <span className="text-dojo-text-muted/70">
                          {' '}· {getNativeLangName(u.nativeLanguage)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_VARIANT[u.status] ?? 'default'}>{u.status}</Badge>
                        {u.suspendedReason && (
                          <p className="mt-1 max-w-48 text-xs text-dojo-text-muted">{u.suspendedReason}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          aria-label={`Role for ${u.email}`}
                          value={u.role}
                          disabled={busy || u.status === 'deleted'}
                          onChange={(e) => patch(u.id, { role: e.target.value as UserRole })}
                          className="rounded-lg border border-dojo-border bg-dojo-surface px-3 py-1.5 text-xs font-medium text-dojo-text-primary outline-none focus:border-dojo-accent disabled:opacity-50"
                        >
                          {USER_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {u.status === 'active' ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy || isSelf}
                              onClick={() => suspend(u)}
                              title={isSelf ? 'You cannot suspend yourself' : 'Revoke access'}
                            >
                              <Ban className="h-3.5 w-3.5" /> Suspend
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              onClick={() => patch(u.id, { status: 'active' })}
                            >
                              <RotateCcw className="h-3.5 w-3.5" /> Restore
                            </Button>
                          )}
                          {u.status !== 'deleted' && (
                            <Button size="sm" variant="ghost" disabled={busy || isSelf} onClick={() => softDelete(u)}>
                              Close
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={busy || isSelf}
                            onClick={() => purge(u)}
                            title="Permanently delete — cannot be undone"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}

function CreateUserForm({
  catalog,
  onError,
  onCreated,
}: {
  catalog: { target: { code: string; name: string }[]; native: { code: string; name: string }[] };
  onError: (msg: string) => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('learner');
  const [preferredTargetLanguage, setTarget] = useState(catalog.target[0]?.code ?? 'ja');
  const [nativeLanguage, setNative] = useState(catalog.native[0]?.code ?? 'en');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    onError('');
    setSaving(true);
    try {
      await adminFetch('/api/admin/users/create', {
        method: 'POST',
        body: { name, email, role, preferredTargetLanguage, nativeLanguage },
      });
      onCreated();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not create the account');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card raised className="!p-5">
      <h3 className="text-sm font-bold text-dojo-text-primary">Add an account</h3>
      {/* Said plainly rather than discovered later: Neon Auth owns credentials,
          so this reserves the row and its settings, and the person claims it by
          signing up with the same address. */}
      <p className="mt-1 text-xs leading-relaxed text-dojo-text-muted">
        This sets up the account and its role in advance. It does not send an invitation
        or set a password — the person signs up normally with this email address and
        lands straight into the role you pick here.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="new-name" className="mb-2 block text-sm text-dojo-text-primary">Name</label>
          <input id="new-name" value={name} onChange={(e) => setName(e.target.value)} className={adminInputClass} />
        </div>
        <div>
          <label htmlFor="new-email" className="mb-2 block text-sm text-dojo-text-primary">Email</label>
          <input id="new-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={adminInputClass} />
        </div>
        <div>
          <label htmlFor="new-role" className="mb-2 block text-sm text-dojo-text-primary">Role</label>
          <select id="new-role" value={role} onChange={(e) => setRole(e.target.value as UserRole)} className={adminInputClass}>
            {USER_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="new-target" className="mb-2 block text-sm text-dojo-text-primary">Learning</label>
            <select id="new-target" value={preferredTargetLanguage} onChange={(e) => setTarget(e.target.value)} className={adminInputClass}>
              {catalog.target.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="new-native" className="mb-2 block text-sm text-dojo-text-primary">Speaks</label>
            <select id="new-native" value={nativeLanguage} onChange={(e) => setNative(e.target.value)} className={adminInputClass}>
              {catalog.native.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      <Button variant="primary" className="mt-6" loading={saving} disabled={saving} onClick={submit}>
        Create account
      </Button>
    </Card>
  );
}
