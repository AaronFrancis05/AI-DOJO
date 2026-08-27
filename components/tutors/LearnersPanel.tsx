'use client';

/* ───────────────────────────────────────────────
   The tutor's roster — everyone they teach, with the language pair each
   learner is working in, plus the two things a tutor wants to do from a
   roster: message one, or open a group room for the whole set.
   Backed by /api/tutor/learners and /api/tutor/cohorts.
   ─────────────────────────────────────────────── */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { getNativeLangName, getTargetLangConfig } from '@/lib/language';
import { MessageSquare, Users } from 'lucide-react';

export interface LearnerRosterClass {
  id: number;
  title: string;
}

interface LearnerRow {
  id: string;
  name: string;
  email: string;
  avatarSrc: string | null;
  level: string;
  nativeLanguage: string;
  preferredTargetLanguage: string;
  lastActiveDate: string | null;
}

type Scope = { kind: 'all_my_learners' } | { kind: 'class'; classSessionId: number };

export function LearnersPanel({ classes }: { classes: LearnerRosterClass[] }) {
  const router = useRouter();

  const [scope, setScope] = useState<Scope>({ kind: 'all_my_learners' });
  const [learners, setLearners] = useState<LearnerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ audienceKind: scope.kind });
    if (scope.kind === 'class') params.set('classSessionId', String(scope.classSessionId));

    fetch(`/api/tutor/learners?${params}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setLearners(Array.isArray(data.learners) ? (data.learners as LearnerRow[]) : []);
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [scope]);

  /** Opens (or reuses) a 1:1 room through the existing chat-room endpoint. */
  const message = useCallback(async (learnerId: string) => {
    setError('');
    try {
      const res = await fetch('/api/chat-rooms', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ memberIds: [learnerId] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Could not open the chat.');
      router.push(`/messages/${data.roomId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open the chat.');
    }
  }, [router]);

  /**
   * Creates the standing group room for whatever is in scope, or tops up the
   * one that exists. Re-running is the intended way to add learners who
   * enrolled after it was made.
   */
  const createCohortRoom = useCallback(async () => {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const res = await fetch('/api/tutor/cohorts', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          scope.kind === 'class'
            ? { audienceKind: 'class', classSessionId: scope.classSessionId }
            : { audienceKind: 'all_my_learners' },
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Could not create the room.');
      setNotice(`Group room ready with ${data.memberCount} members.`);
      router.push(`/messages/${data.roomId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the room.');
    } finally {
      setBusy(false);
    }
  }, [scope, router]);

  const inputClass =
    'rounded-(--radius-md) border border-dojo-border bg-dojo-surface px-4 py-2 text-sm text-dojo-text-primary focus:border-dojo-accent focus:outline-none';

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select
          aria-label="Which learners"
          value={scope.kind === 'class' ? String(scope.classSessionId) : 'all'}
          onChange={(e) =>
            setScope(
              e.target.value === 'all'
                ? { kind: 'all_my_learners' }
                : { kind: 'class', classSessionId: Number(e.target.value) },
            )
          }
          className={inputClass}
        >
          <option value="all">Everyone I teach</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>{c.title}</option>
          ))}
        </select>

        <Button variant="secondary" loading={busy} disabled={busy || learners.length === 0} onClick={createCohortRoom}>
          <Users className="h-4 w-4" /> Group chat room
        </Button>
      </div>

      {error && <p className="text-sm text-dojo-danger">{error}</p>}
      {notice && <p className="text-sm text-dojo-success-strong">{notice}</p>}

      {loading ? (
        <Card className="animate-pulse !p-5">
          <div className="h-12 rounded bg-dojo-surface-raised" />
        </Card>
      ) : learners.length === 0 ? (
        <p className="rounded-(--radius-md) border border-dashed border-dojo-border px-4 py-8 text-center text-sm text-dojo-text-muted">
          No learners here yet. They appear once someone enrols in a class, books you, or
          joins one of your assessments.
        </p>
      ) : (
        <div className="space-y-3">
          {learners.map((l) => (
            <Card key={l.id} className="!p-4">
              <div className="flex items-center gap-3">
                <Avatar name={l.name || l.email} src={l.avatarSrc ?? undefined} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-dojo-text-primary">
                    {l.name || l.email}
                  </p>
                  <p className="text-xs text-dojo-text-muted">
                    {getTargetLangConfig(l.preferredTargetLanguage).name} ·{' '}
                    speaks {getNativeLangName(l.nativeLanguage)} · {l.level}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => message(l.id)}>
                  <MessageSquare className="h-4 w-4" /> Message
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
