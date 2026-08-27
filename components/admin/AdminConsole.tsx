/* ───────────────────────────────────────────────
   Admin console — tutor verification, user roles,
   course publishing. Consumes /api/admin/*, every
   one of which re-checks requireRole('admin').
   ─────────────────────────────────────────────── */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Tabs } from '@/components/ui/Tabs';
import { Toggle } from '@/components/ui/Toggle';
import { usePageTitle } from '@/lib/hooks/PageTitleContext';
import { USER_ROLES, type UserRole } from '@/lib/auth/roles';
import { getTargetLangConfig } from '@/lib/language';
import { AlertCircleIcon, LoaderIcon } from '@/components/Icons';
import { Check, GraduationCap, Search, X } from 'lucide-react';

interface AdminTutor {
  id: number;
  userId: string;
  headline: string;
  bio: string | null;
  languages: string[];
  hourlyRateCents: number;
  currency: string;
  timezone: string;
  verificationStatus: string;
  isAcceptingBookings: boolean;
  createdAt: string;
  name: string;
  email: string;
}

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  level: string;
  tier: string;
  preferredTargetLanguage: string;
  nativeLanguage: string;
  onboardingCompletedAt: string | null;
  createdAt: string;
}

interface AdminCourse {
  id: number;
  slug: string;
  title: string;
  description: string;
  difficulty: string;
  isActive: boolean;
  displayOrder: number;
}

const STATUS_VARIANT: Record<string, 'success' | 'outline' | 'default'> = {
  verified: 'success',
  pending: 'outline',
  rejected: 'default',
};

function formatRate(cents: number, currency: string): string {
  return `${(cents / 100).toFixed(0)} ${currency}/hr`;
}

export function AdminConsole() {
  usePageTitle('Admin');
  const [error, setError] = useState('');

  return (
    <div className="mx-auto w-full max-w-7xl p-6 lg:p-10">
      <div className="mb-8">
        <h1 className="hidden md:block text-3xl font-bold tracking-tight leading-none text-dojo-text-primary">
          Admin
        </h1>
        <p className="mt-2 text-base leading-relaxed text-dojo-text-muted">
          Verify tutors, review accounts, and control which courses learners can see.
        </p>
      </div>

      {error && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-dojo-danger/30 bg-dojo-danger/10 px-3 py-2.5 text-sm text-dojo-danger">
          <AlertCircleIcon className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <Tabs
        tabs={[
          { id: 'tutors', label: 'Tutors' },
          { id: 'users', label: 'Users' },
          { id: 'courses', label: 'Courses' },
        ]}
        renderPanel={(tab) => (
          <div className="pt-6">
            {tab === 'tutors' && <TutorsPanel onError={setError} />}
            {tab === 'users' && <UsersPanel onError={setError} />}
            {tab === 'courses' && <CoursesPanel onError={setError} />}
          </div>
        )}
      />
    </div>
  );
}

function Loading() {
  return (
    <div className="flex items-center justify-center py-16">
      <LoaderIcon className="h-6 w-6 animate-spin text-dojo-accent" />
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <Card className="border-dashed border-dojo-border/60 py-16 text-center">
      <p className="text-sm text-dojo-text-muted">{children}</p>
    </Card>
  );
}

function TutorsPanel({ onError }: { onError: (msg: string) => void }) {
  const [tutors, setTutors] = useState<AdminTutor[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  // A write bumps this instead of calling a loader directly, so the fetch
  // stays inside the effect that owns it.
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/admin/tutors', { credentials: 'include' });
        if (!res.ok) throw new Error(`/api/admin/tutors returned ${res.status}`);
        const data = await res.json();
        if (!cancelled) setTutors(data.tutors ?? []);
      } catch (e) {
        if (!cancelled) onError(e instanceof Error ? e.message : 'Failed to load tutors');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [reload, onError]);

  const patch = async (id: number, body: Record<string, unknown>) => {
    setBusyId(id);
    onError('');
    try {
      const res = await fetch(`/api/admin/tutors/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Update failed (${res.status})`);
      setReload((n) => n + 1);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <Loading />;
  if (tutors.length === 0) return <EmptyState>No tutor applications yet.</EmptyState>;

  return (
    <div className="flex flex-col gap-4">
      {tutors.map((tutor) => (
        <Card key={tutor.id} raised className="!p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <GraduationCap className="h-4 w-4 shrink-0 text-dojo-accent" />
                <span className="text-base font-bold text-dojo-text-primary">{tutor.name || tutor.email}</span>
                <Badge variant={STATUS_VARIANT[tutor.verificationStatus] ?? 'default'}>
                  {tutor.verificationStatus}
                </Badge>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-dojo-text-primary">{tutor.headline}</p>
              {tutor.bio && (
                <p className="mt-1 text-sm leading-relaxed text-dojo-text-muted">{tutor.bio}</p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-dojo-text-muted">
                <span>{tutor.email}</span>
                <span>{tutor.languages.map((c) => getTargetLangConfig(c).name).join(', ')}</span>
                <span>{formatRate(tutor.hourlyRateCents, tutor.currency)}</span>
                <span>{tutor.timezone}</span>
              </div>
            </div>

            <div className="flex shrink-0 flex-col gap-2 sm:items-end">
              <div className="flex gap-2">
                <Button
                  size="sm"
                  loading={busyId === tutor.id}
                  disabled={tutor.verificationStatus === 'verified'}
                  onClick={() => patch(tutor.id, { verificationStatus: 'verified' })}
                >
                  <Check className="h-3.5 w-3.5" />
                  Verify
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  loading={busyId === tutor.id}
                  disabled={tutor.verificationStatus === 'rejected'}
                  onClick={() => patch(tutor.id, { verificationStatus: 'rejected' })}
                >
                  <X className="h-3.5 w-3.5" />
                  Reject
                </Button>
              </div>
              <Toggle
                enabled={tutor.isAcceptingBookings}
                onChange={(next) => patch(tutor.id, { isAcceptingBookings: next })}
                label="Accepting bookings"
              />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function UsersPanel({ onError }: { onError: (msg: string) => void }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users?q=${encodeURIComponent(q)}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`/api/admin/users returned ${res.status}`);
      const data = await res.json();
      setUsers(data.users ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    // Debounced so typing a name isn't a query per keystroke.
    const t = setTimeout(() => load(query), 250);
    return () => clearTimeout(t);
  }, [query, load]);

  const setRole = async (userId: string, role: UserRole) => {
    setBusyId(userId);
    onError('');
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId, role }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Update failed (${res.status})`);
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)));
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 rounded-lg border border-dojo-border bg-dojo-surface px-4 py-2 focus-within:border-dojo-accent">
        <Search className="h-4 w-4 shrink-0 text-dojo-text-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or email…"
          className="w-full bg-transparent py-1 text-sm text-dojo-text-primary outline-none placeholder:text-dojo-text-muted/60"
        />
      </div>

      {loading ? (
        <Loading />
      ) : users.length === 0 ? (
        <EmptyState>No users match that search.</EmptyState>
      ) : (
        <>
          <p className="text-xs text-dojo-text-muted">
            Showing {users.length} of {total}
          </p>
          <Card raised className="!p-0 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-dojo-border text-xs uppercase tracking-wider text-dojo-text-muted">
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Email</th>
                  <th className="px-4 py-3 font-semibold">Languages</th>
                  <th className="px-4 py-3 font-semibold">Onboarded</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-dojo-border/60 last:border-0">
                    <td className="px-4 py-3 font-medium text-dojo-text-primary">{u.name || '—'}</td>
                    <td className="px-4 py-3 text-dojo-text-muted">{u.email}</td>
                    <td className="px-4 py-3 text-dojo-text-muted">
                      {getTargetLangConfig(u.preferredTargetLanguage).name}
                    </td>
                    <td className="px-4 py-3 text-dojo-text-muted">
                      {u.onboardingCompletedAt ? 'Yes' : 'No'}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={u.role}
                        disabled={busyId === u.id}
                        onChange={(e) => setRole(u.id, e.target.value as UserRole)}
                        className="rounded-lg border border-dojo-border bg-dojo-surface px-3 py-1.5 text-xs font-medium text-dojo-text-primary outline-none focus:border-dojo-accent disabled:opacity-50"
                      >
                        {USER_ROLES.map((role) => (
                          <option key={role} value={role}>{role}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}

function CoursesPanel({ onError }: { onError: (msg: string) => void }) {
  const [courses, setCourses] = useState<AdminCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/admin/courses', { credentials: 'include' });
        if (!res.ok) throw new Error(`/api/admin/courses returned ${res.status}`);
        const data = await res.json();
        if (!cancelled) setCourses(data.courses ?? []);
      } catch (e) {
        if (!cancelled) onError(e instanceof Error ? e.message : 'Failed to load courses');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [onError]);

  const toggle = async (course: AdminCourse, isActive: boolean) => {
    setBusyId(course.id);
    onError('');
    try {
      const res = await fetch('/api/admin/courses', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ courseId: course.id, isActive }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Update failed (${res.status})`);
      setCourses((prev) => prev.map((c) => (c.id === course.id ? { ...c, isActive } : c)));
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <Loading />;
  if (courses.length === 0) return <EmptyState>No courses have been created yet.</EmptyState>;

  return (
    <div className="flex flex-col gap-4">
      {courses.map((course) => (
        <Card key={course.id} raised className="!p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base font-bold text-dojo-text-primary">{course.title}</span>
                <Badge variant={course.difficulty as 'beginner'}>{course.difficulty}</Badge>
                {!course.isActive && <Badge variant="outline">hidden</Badge>}
              </div>
              <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-dojo-text-muted">
                {course.description}
              </p>
              <p className="mt-2 font-mono text-xs text-dojo-text-muted">/courses/{course.slug}</p>
            </div>
            <div className="shrink-0">
              <Toggle
                enabled={course.isActive}
                onChange={(next) => toggle(course, next)}
                label="Published"
                description={busyId === course.id ? 'Saving…' : 'Visible to learners'}
              />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
