'use client';

/* ───────────────────────────────────────────────
   Tutor announcements — compose to a class, a course cohort, or every
   learner, and see what has already been sent. Backed by
   /api/tutor/announcements, which re-checks the role and the tutor's own
   language sets server-side.
   ─────────────────────────────────────────────── */

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { getNativeLangName, getTargetLangConfig } from '@/lib/language';
import { useLanguageCatalog } from '@/lib/language-context';
import type { TutorProfile } from '@/lib/hooks/useTutorProfile';
import { Megaphone, Send } from 'lucide-react';

export interface AnnouncementClassOption {
  id: number;
  title: string;
}

interface SentAnnouncement {
  id: number;
  title: string;
  body: string;
  targetLanguage: string | null;
  instructionLanguage: string | null;
  audienceKind: string;
  audienceName: string | null;
  recipientCount: number;
  createdAt: string;
}

interface CourseOption {
  id: number;
  title: string;
}

type AudienceKind = 'class' | 'course' | 'all_my_learners';

const inputClass =
  'w-full rounded-(--radius-md) border border-dojo-border bg-dojo-surface px-4 py-2 text-sm text-dojo-text-primary placeholder:text-dojo-text-muted focus:border-dojo-accent focus:outline-none';

function describeAudience(a: SentAnnouncement): string {
  if (a.audienceKind === 'class') return a.audienceName ?? 'a class';
  if (a.audienceKind === 'course') return a.audienceName ?? 'a course';
  return 'all my learners';
}

export function AnnouncementsPanel({
  profile,
  classes,
}: {
  profile: TutorProfile;
  classes: AnnouncementClassOption[];
}) {
  const catalog = useLanguageCatalog();

  const teachOptions = catalog.target.filter((l) => profile.languages.includes(l.code));
  const explainOptions = catalog.native.filter((l) => profile.instructionLanguages.includes(l.code));

  const [sent, setSent] = useState<SentAnnouncement[]>([]);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [audienceKind, setAudienceKind] = useState<AudienceKind>('all_my_learners');
  const [classSessionId, setClassSessionId] = useState<number | null>(null);
  const [courseId, setCourseId] = useState<number | null>(null);
  const [targetLanguage, setTargetLanguage] = useState(teachOptions[0]?.code ?? '');
  const [instructionLanguage, setInstructionLanguage] = useState(explainOptions[0]?.code ?? '');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  // Stored with the scope it was counted for, rather than cleared whenever the
  // scope changes: clearing would mean a setState in the effect body, and a
  // count kept next to its key is self-invalidating — if they disagree, the
  // number on screen is for a different audience and must not be shown.
  const [preview, setPreview] = useState<{ key: string; count: number } | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/api/tutor/announcements', { credentials: 'include' }).then((r) => r.json()).catch(() => ({})),
      fetch('/api/courses', { credentials: 'include' }).then((r) => r.json()).catch(() => ({})),
    ]).then(([a, c]) => {
      if (cancelled) return;
      if (Array.isArray(a.announcements)) setSent(a.announcements as SentAnnouncement[]);
      if (Array.isArray(c.courses)) setCourses(c.courses as CourseOption[]);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [reloadKey]);

  /**
   * The recipient count comes from the server, through the same
   * `resolveAudience` the send uses — counting it client-side from a roster
   * would be a second definition of "my learners" and would drift.
   */
  const previewKey = JSON.stringify({ audienceKind, classSessionId, courseId, targetLanguage });
  const recipientCount = preview?.key === previewKey ? preview.count : null;

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    fetch('/api/tutor/announcements?preview=1', {
      method: 'POST',
      credentials: 'include',
      signal: controller.signal,
      headers: { 'content-type': 'application/json' },
      body: previewKey,
    })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && typeof data?.recipientCount === 'number') {
          setPreview({ key: previewKey, count: data.recipientCount });
        }
      })
      .catch(() => {});

    return () => { cancelled = true; controller.abort(); };
  }, [previewKey]);

  // Plain function, not useCallback: the React Compiler memoizes this file, and
  // a hand-written dep array here does not match what it infers.
  const submit = async () => {
    setError('');
    if (!title.trim()) return setError('Give it a title.');
    if (!body.trim()) return setError('Write something to send.');

    setSending(true);
    try {
      const res = await fetch('/api/tutor/announcements', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          audienceKind,
          classSessionId,
          courseId,
          targetLanguage,
          instructionLanguage,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Could not send it.');
      setTitle('');
      setBody('');
      setReloadKey((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send it.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mt-6 space-y-6">
      <Card className="!p-5">
        <h3 className="text-sm font-bold text-dojo-text-primary">Send an announcement</h3>
        <p className="mt-1 text-xs leading-relaxed text-dojo-text-muted">
          Lands on each learner&apos;s notification bell straight away. Write it in the
          language you teach that group in.
        </p>

        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="ann-audience" className="mb-2 block text-sm text-dojo-text-primary">
                Who it goes to
              </label>
              <select
                id="ann-audience"
                value={audienceKind}
                onChange={(e) => setAudienceKind(e.target.value as AudienceKind)}
                className={inputClass}
              >
                <option value="all_my_learners">Everyone I teach</option>
                <option value="class">One class</option>
                <option value="course">A course cohort</option>
              </select>
            </div>

            {audienceKind === 'class' && (
              <div>
                <label htmlFor="ann-class" className="mb-2 block text-sm text-dojo-text-primary">
                  Class
                </label>
                <select
                  id="ann-class"
                  value={classSessionId ?? ''}
                  onChange={(e) => setClassSessionId(e.target.value ? Number(e.target.value) : null)}
                  className={inputClass}
                >
                  <option value="">Pick a class…</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>{c.title}</option>
                  ))}
                </select>
              </div>
            )}

            {audienceKind === 'course' && (
              <div>
                <label htmlFor="ann-course" className="mb-2 block text-sm text-dojo-text-primary">
                  Course
                </label>
                <select
                  id="ann-course"
                  value={courseId ?? ''}
                  onChange={(e) => setCourseId(e.target.value ? Number(e.target.value) : null)}
                  className={inputClass}
                >
                  <option value="">Pick a course…</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>{c.title}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="ann-target" className="mb-2 block text-sm text-dojo-text-primary">
                About the course in
              </label>
              <select
                id="ann-target"
                value={targetLanguage}
                onChange={(e) => setTargetLanguage(e.target.value)}
                className={inputClass}
              >
                {teachOptions.map((l) => (
                  <option key={l.code} value={l.code}>{l.flag} {l.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="ann-instr" className="mb-2 block text-sm text-dojo-text-primary">
                Written in
              </label>
              <select
                id="ann-instr"
                value={instructionLanguage}
                onChange={(e) => setInstructionLanguage(e.target.value)}
                className={inputClass}
              >
                {explainOptions.map((l) => (
                  <option key={l.code} value={l.code}>{l.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="ann-title" className="mb-2 block text-sm text-dojo-text-primary">
              Title
            </label>
            <input
              id="ann-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={160}
              placeholder="Thursday's class moves to 18:00"
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="ann-body" className="mb-2 block text-sm text-dojo-text-primary">
              Message
            </label>
            <textarea
              id="ann-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              maxLength={4000}
              className={`${inputClass} resize-y leading-relaxed`}
            />
          </div>
        </div>

        {error && <p className="mt-4 text-sm text-dojo-danger">{error}</p>}

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <Button variant="primary" loading={sending} disabled={sending} onClick={submit}>
            <Send className="h-4 w-4" /> Send
          </Button>
          <p className="text-xs text-dojo-text-muted">
            {recipientCount === null
              ? 'Counting recipients…'
              : `Reaches ${recipientCount} ${recipientCount === 1 ? 'learner' : 'learners'}.`}
          </p>
        </div>
      </Card>

      <div>
        <h3 className="mb-3 text-sm font-bold text-dojo-text-primary">Already sent</h3>
        {loading ? (
          <Card className="animate-pulse !p-5">
            <div className="h-12 rounded bg-dojo-surface-raised" />
          </Card>
        ) : sent.length === 0 ? (
          <p className="rounded-(--radius-md) border border-dashed border-dojo-border px-4 py-8 text-center text-sm text-dojo-text-muted">
            You have not sent an announcement yet.
          </p>
        ) : (
          <div className="space-y-3">
            {sent.map((a) => (
              <Card key={a.id} className="!p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-dojo-accent/10">
                    <Megaphone className="h-5 w-5 text-dojo-accent" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-dojo-text-primary">{a.title}</p>
                    <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-dojo-text-muted">
                      {a.body}
                    </p>
                    <p className="mt-2 text-xs text-dojo-text-muted">
                      {new Date(a.createdAt).toLocaleDateString()} · {describeAudience(a)} ·{' '}
                      {a.recipientCount} {a.recipientCount === 1 ? 'recipient' : 'recipients'}
                      {a.targetLanguage && ` · ${getTargetLangConfig(a.targetLanguage).name}`}
                      {a.instructionLanguage && `, in ${getNativeLangName(a.instructionLanguage)}`}
                    </p>
                  </div>
                  <Badge variant="outline" className="capitalize">
                    {a.audienceKind.replace(/_/g, ' ')}
                  </Badge>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
