/* ───────────────────────────────────────────────
   Tutor console — schedule, availability, and the two room types a tutor
   can create. Consumes /api/classes, /api/assessments, /api/bookings and
   /api/tutor/availability, every one of which re-checks the role server-side.
   ─────────────────────────────────────────────── */

'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Tabs } from '@/components/ui/Tabs';
import { AvailabilityEditor } from '@/components/tutors/AvailabilityEditor';
import { AnnouncementsPanel } from '@/components/tutors/AnnouncementsPanel';
import { LearnersPanel } from '@/components/tutors/LearnersPanel';
import { usePageTitle } from '@/lib/hooks/PageTitleContext';
import { useUser } from '@/lib/auth/user-context';
import { getTargetLangConfig, getNativeLangName } from '@/lib/language';
import { useLanguageCatalog } from '@/lib/language-context';
import { useTutorProfile, type TutorProfile } from '@/lib/hooks/useTutorProfile';
import { CLASS_DURATIONS_MINUTES, MAX_CLASS_CAPACITY } from '@/lib/tutors/config';
import { interviewerChoices } from '@/lib/interview/persona';
import { cn } from '@/lib/design-tokens';
import { Bot, Calendar, Check, ClipboardCheck, Plus, Users, Video } from 'lucide-react';

const INTERVIEWER_CHOICES = interviewerChoices();

interface BookingRow {
  id: number;
  tutorName: string;
  scheduledAt: string;
  durationMinutes: number;
  status: string;
  purpose: string;
  isTutor: boolean;
}

interface ClassRow {
  id: number;
  title: string;
  targetLanguage: string;
  instructionLanguage: string | null;
  scheduledAt: string;
  durationMinutes: number;
  capacity: number;
  enrolledCount: number;
  status: string;
  isTutor: boolean;
}

interface AssessmentRow {
  id: number;
  title: string;
  targetLanguage: string;
  instructionLanguage: string | null;
  scheduledAt: string;
  durationMinutes: number;
  minutesPerLearner: number;
  waitingCount: number;
  /** 'tutor' | 'ai' — who runs it. */
  examiner: string;
  status: string;
  isTutor: boolean;
}

/**
 * "Japanese, explained in Luganda" — the pair a room is actually run in.
 *
 * The instruction language is omitted when there is none, which is the
 * pre-existing behaviour: each learner reads in their own native language.
 */
function describeLanguagePair(targetLanguage: string, instructionLanguage: string | null): string {
  const target = getTargetLangConfig(targetLanguage).name;
  return instructionLanguage
    ? `${target}, explained in ${getNativeLangName(instructionLanguage)}`
    : target;
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

/**
 * `datetime-local` yields wall-clock text with no zone. `new Date(value)`
 * reads it in the browser's zone, which is what the tutor meant, and the API
 * stores the resulting instant — so the value must be sent as an ISO string,
 * never as the raw field text.
 */
function localInputToIso(value: string): string | null {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/* ── Room creation ───────────────────────────────────────────────────── */

type RoomKind = 'class' | 'assessment';

function CreateRoomForm({
  kind,
  onCreated,
  profile,
}: {
  kind: RoomKind;
  onCreated: () => void;
  profile: TutorProfile;
}) {
  const user = useUser();
  const catalog = useLanguageCatalog();
  // Only what this tutor holds, intersected with what the admin still offers:
  // a language they were approved for years ago may since have been disabled,
  // and offering it here would just produce a 400 on submit.
  const teachOptions = catalog.target.filter((l) => profile.languages.includes(l.code));
  const explainOptions = catalog.native.filter((l) => profile.instructionLanguages.includes(l.code));

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  // Their own preferred language when it is one of the options actually on
  // offer, otherwise the first that is. Checked against the filtered lists, not
  // the raw profile: a language they hold but the admin has since disabled is
  // not in the select, so preselecting it left the field showing the first
  // option while submitting a different code — and the route then 400s.
  const [targetLanguage, setTargetLanguage] = useState(
    () =>
      (user?.preferredTargetLanguage &&
      teachOptions.some((l) => l.code === user.preferredTargetLanguage)
        ? user.preferredTargetLanguage
        : teachOptions[0]?.code) ?? '',
  );
  const [instructionLanguage, setInstructionLanguage] = useState(
    () =>
      (user?.nativeLanguage && explainOptions.some((l) => l.code === user.nativeLanguage)
        ? user.nativeLanguage
        : explainOptions[0]?.code) ?? '',
  );
  const [scheduledAt, setScheduledAt] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [capacity, setCapacity] = useState(12);
  const [minutesPerLearner, setMinutesPerLearner] = useState(10);
  const [examiner, setExaminer] = useState<'tutor' | 'ai'>('tutor');
  const [interviewerAvatarId, setInterviewerAvatarId] = useState(INTERVIEWER_CHOICES[0].avatarId);
  const [interviewerBrief, setInterviewerBrief] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = useCallback(async () => {
    setError('');
    const iso = localInputToIso(scheduledAt);
    if (!title.trim()) return setError('Give it a title.');
    if (!iso) return setError('Pick a date and time.');
    if (!targetLanguage) return setError('Pick the language you are teaching.');
    if (!instructionLanguage) return setError('Pick the language you will explain in.');

    setSaving(true);
    try {
      const res = await fetch(kind === 'class' ? '/api/classes' : '/api/assessments', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          targetLanguage,
          instructionLanguage,
          scheduledAt: iso,
          durationMinutes,
          ...(kind === 'class'
            ? { capacity }
            : {
                minutesPerLearner,
                examiner,
                aiInterviewerAvatarId: interviewerAvatarId,
                aiInterviewerBrief: interviewerBrief.trim() || null,
              }),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Could not create it.');
      setTitle('');
      setDescription('');
      setScheduledAt('');
      setInterviewerBrief('');
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create it.');
    } finally {
      setSaving(false);
    }
  }, [kind, title, description, targetLanguage, instructionLanguage, scheduledAt, durationMinutes, capacity, minutesPerLearner, examiner, interviewerAvatarId, interviewerBrief, onCreated]);

  const inputClass =
    'w-full rounded-(--radius-md) border border-dojo-border bg-dojo-surface px-4 py-2 text-sm text-dojo-text-primary placeholder:text-dojo-text-muted focus:border-dojo-accent focus:outline-none';

  return (
    <Card className="!p-5">
      <h3 className="text-sm font-bold text-dojo-text-primary">
        {kind === 'class' ? 'Schedule a class' : 'Schedule an assessment'}
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-dojo-text-muted">
        {kind === 'class'
          ? 'Everyone joins together. Good for a conversation hour or the live lesson for a unit.'
          : 'Learners queue and you admit them one at a time, grading each as you go — or an AI examiner interviews each of them for you.'}
      </p>

      <div className="mt-4 space-y-4">
        <div>
          <label htmlFor={`${kind}-title`} className="mb-2 block text-sm text-dojo-text-primary">
            Title
          </label>
          <input
            id={`${kind}-title`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={150}
            placeholder={kind === 'class' ? 'Ordering food — live practice' : 'Unit 2 speaking check'}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor={`${kind}-desc`} className="mb-2 block text-sm text-dojo-text-primary">
            Description <span className="text-dojo-text-muted">(optional)</span>
          </label>
          <textarea
            id={`${kind}-desc`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            maxLength={2000}
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${kind}-lang`} className="mb-2 block text-sm text-dojo-text-primary">
              Language taught
            </label>
            <select
              id={`${kind}-lang`}
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
            <label htmlFor={`${kind}-instr`} className="mb-2 block text-sm text-dojo-text-primary">
              Explained in
            </label>
            <select
              id={`${kind}-instr`}
              value={instructionLanguage}
              onChange={(e) => setInstructionLanguage(e.target.value)}
              className={inputClass}
            >
              {explainOptions.map((l) => (
                <option key={l.code} value={l.code}>{l.name}</option>
              ))}
            </select>
            <p className="mt-1.5 text-xs leading-relaxed text-dojo-text-muted">
              How you coach and give feedback. The room chat translates to this
              by default{kind === 'assessment' ? ', and the AI examiner debriefs in it' : ''}.
            </p>
          </div>

          <div>
            <label htmlFor={`${kind}-when`} className="mb-2 block text-sm text-dojo-text-primary">
              When
            </label>
            <input
              id={`${kind}-when`}
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor={`${kind}-dur`} className="mb-2 block text-sm text-dojo-text-primary">
              Duration
            </label>
            <select
              id={`${kind}-dur`}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value))}
              className={inputClass}
            >
              {CLASS_DURATIONS_MINUTES.map((d) => (
                <option key={d} value={d}>{d} min</option>
              ))}
            </select>
          </div>

          {kind === 'class' ? (
            <div>
              <label htmlFor="class-capacity" className="mb-2 block text-sm text-dojo-text-primary">
                Capacity
              </label>
              <input
                id="class-capacity"
                type="number"
                min={1}
                max={MAX_CLASS_CAPACITY}
                value={capacity}
                onChange={(e) => setCapacity(Number(e.target.value))}
                className={inputClass}
              />
            </div>
          ) : (
            <div>
              <label htmlFor="assessment-per" className="mb-2 block text-sm text-dojo-text-primary">
                Minutes per learner
              </label>
              <input
                id="assessment-per"
                type="number"
                min={2}
                max={60}
                value={minutesPerLearner}
                onChange={(e) => setMinutesPerLearner(Number(e.target.value))}
                className={inputClass}
              />
              <p className="mt-1 text-[11px] leading-relaxed text-dojo-text-muted">
                {examiner === 'ai'
                  ? "How long each learner's interview runs."
                  : "Only used to estimate a waiting learner's place in line."}
              </p>
            </div>
          )}
        </div>

        {kind === 'assessment' && (
          <div className="space-y-4 rounded-(--radius-md) border border-dojo-border p-4">
            <div>
              <label htmlFor="assessment-examiner" className="mb-2 block text-sm text-dojo-text-primary">
                Who examines
              </label>
              <select
                id="assessment-examiner"
                value={examiner}
                onChange={(e) => setExaminer(e.target.value === 'ai' ? 'ai' : 'tutor')}
                className={inputClass}
              >
                <option value="tutor">Me, live — learners queue and I admit them</option>
                <option value="ai">An AI examiner — each learner interviews on their own</option>
              </select>
              <p className="mt-1 text-[11px] leading-relaxed text-dojo-text-muted">
                You can change this later, which is usually when it matters — an assessment you
                meant to run yourself can be handed over from the room.
              </p>
            </div>

            {examiner === 'ai' && (
              <>
                <div>
                  <p className="mb-2 flex items-center gap-2 text-sm text-dojo-text-primary">
                    <Bot className="h-4 w-4 shrink-0 text-dojo-accent" /> The examiner
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {INTERVIEWER_CHOICES.map((choice) => (
                      <button
                        key={choice.avatarId}
                        type="button"
                        onClick={() => setInterviewerAvatarId(choice.avatarId)}
                        aria-pressed={interviewerAvatarId === choice.avatarId}
                        className={cn(
                          'relative w-20 rounded-(--radius-md) border p-2 text-center transition-colors',
                          interviewerAvatarId === choice.avatarId
                            ? 'border-dojo-accent bg-dojo-accent-soft/40'
                            : 'border-dojo-border hover:border-dojo-accent',
                        )}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- catalogue portrait, fixed local asset */}
                        <img
                          src={choice.imageSrc}
                          alt=""
                          className="mx-auto h-12 w-12 rounded-full object-cover"
                        />
                        <span className="mt-2 block truncate text-[11px] text-dojo-text-primary">
                          {choice.name}
                        </span>
                        {interviewerAvatarId === choice.avatarId && (
                          <Check className="absolute right-1 top-1 h-3.5 w-3.5 text-dojo-accent" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="assessment-brief"
                    className="mb-2 block text-sm text-dojo-text-primary"
                  >
                    Your brief to the examiner{' '}
                    <span className="text-dojo-text-muted">(optional)</span>
                  </label>
                  <textarea
                    id="assessment-brief"
                    value={interviewerBrief}
                    onChange={(e) => setInterviewerBrief(e.target.value)}
                    rows={3}
                    maxLength={2000}
                    placeholder="Push them on past-tense forms and on keigo when they order. Don't dwell on numbers — we covered those last week."
                    className={inputClass}
                  />
                  <p className="mt-1 text-[11px] leading-relaxed text-dojo-text-muted">
                    Learners never see this, and nothing they say during the interview can change
                    it.
                  </p>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {error && <p className="mt-4 text-sm text-dojo-danger">{error}</p>}

      <Button variant="primary" className="mt-6" loading={saving} disabled={saving} onClick={submit}>
        <Plus className="h-4 w-4" /> Schedule
      </Button>
    </Card>
  );
}

/* ── Console ─────────────────────────────────────────────────────────── */

export function TutorConsole() {
  usePageTitle('Teaching');

  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [assessments, setAssessments] = useState<AssessmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  // The scheduling forms are constrained by it, so they only render once it is
  // known — an unconstrained picker would offer languages the API refuses.
  const { profile } = useTutorProfile();

  const load = useCallback(
    () =>
      Promise.all([
        fetch('/api/bookings', { credentials: 'include' }).then((r) => r.json()).catch(() => ({})),
        fetch('/api/classes?mine=1', { credentials: 'include' }).then((r) => r.json()).catch(() => ({})),
        fetch('/api/assessments?mine=1', { credentials: 'include' }).then((r) => r.json()).catch(() => ({})),
      ]).then(([b, c, a]) => {
        setLoading(false);
        if (Array.isArray(b.bookings)) {
          // Filtered here rather than during render: "is this still upcoming?"
          // reads the clock, which is not a pure value to read while rendering.
          const cutoff = Date.now() - 60 * 60 * 1000;
          setBookings(
            (b.bookings as BookingRow[]).filter(
              (x) =>
                x.isTutor &&
                x.status !== 'cancelled' &&
                new Date(x.scheduledAt).getTime() > cutoff,
            ),
          );
        }
        if (Array.isArray(c.classes)) setClasses((c.classes as ClassRow[]).filter((x) => x.isTutor));
        if (Array.isArray(a.assessments)) {
          setAssessments((a.assessments as AssessmentRow[]).filter((x) => x.isTutor));
        }
      }),
    [],
  );

  useEffect(() => { void load(); }, [load]);

  const tabs = [
    { id: 'schedule', label: 'Schedule' },
    { id: 'classes', label: 'Classes' },
    { id: 'assessments', label: 'Assessments' },
    { id: 'learners', label: 'Learners' },
    { id: 'announcements', label: 'Announcements' },
    { id: 'availability', label: 'Availability' },
  ];

  // Both panels offer "one of my classes" as a scope, from the list already
  // loaded above rather than a second fetch.
  const classOptions = classes.map((c) => ({ id: c.id, title: c.title }));

  const emptyClass = 'rounded-(--radius-md) border border-dashed border-dojo-border px-4 py-8 text-center text-sm text-dojo-text-muted';

  return (
    <div className="mx-auto w-full max-w-5xl p-6">
      <h1 className="mb-8 hidden text-2xl font-bold leading-none tracking-tight text-dojo-text-primary md:block">
        Teaching
      </h1>

      <Tabs
        tabs={tabs}
        renderPanel={(tabId) => {
          if (loading) {
            return (
              <div className="mt-6 space-y-3">
                {[0, 1].map((i) => (
                  <Card key={i} className="animate-pulse !p-5">
                    <div className="h-12 rounded bg-dojo-surface-raised" />
                  </Card>
                ))}
              </div>
            );
          }

          if (tabId === 'schedule') {
            return (
              <div className="mt-6 space-y-3">
                {bookings.length === 0 ? (
                  <p className={emptyClass}>No one-to-one bookings coming up.</p>
                ) : (
                  bookings.map((b) => (
                    <Link key={b.id} href={`/live/${b.id}`} className="block">
                      <Card hoverable className="!p-4">
                        <div className="flex items-center gap-4">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-dojo-accent/10">
                            <Video className="h-5 w-5 text-dojo-accent" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-dojo-text-primary">
                              One-to-one{b.purpose === 'evaluation' && ' · Evaluation'}
                            </p>
                            <p className="text-xs text-dojo-text-muted">
                              {formatWhen(b.scheduledAt)} · {b.durationMinutes} min
                            </p>
                          </div>
                          <Badge variant={b.status === 'confirmed' ? 'accent' : 'outline'} className="capitalize">
                            {b.status}
                          </Badge>
                        </div>
                      </Card>
                    </Link>
                  ))
                )}
              </div>
            );
          }

          if (tabId === 'classes') {
            return (
              <div className="mt-6 space-y-6">
                <div className="space-y-3">
                  {classes.length === 0 ? (
                    <p className={emptyClass}>No classes scheduled.</p>
                  ) : (
                    classes.map((c) => (
                      <Link key={c.id} href={`/live/class/${c.id}`} className="block">
                        <Card hoverable className="!p-4">
                          <div className="flex items-center gap-4">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-dojo-accent/10">
                              <Users className="h-5 w-5 text-dojo-accent" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-dojo-text-primary">{c.title}</p>
                              <p className="text-xs text-dojo-text-muted">
                                {formatWhen(c.scheduledAt)} · {c.enrolledCount}/{c.capacity} enrolled ·{' '}
                                {describeLanguagePair(c.targetLanguage, c.instructionLanguage)}
                              </p>
                            </div>
                            <Badge variant={c.status === 'live' ? 'accent' : 'outline'} className="capitalize">
                              {c.status}
                            </Badge>
                          </div>
                        </Card>
                      </Link>
                    ))
                  )}
                </div>
                {profile && <CreateRoomForm kind="class" onCreated={load} profile={profile} />}
              </div>
            );
          }

          if (tabId === 'assessments') {
            return (
              <div className="mt-6 space-y-6">
                <div className="space-y-3">
                  {assessments.length === 0 ? (
                    <p className={emptyClass}>No assessments scheduled.</p>
                  ) : (
                    assessments.map((a) => (
                      <Link key={a.id} href={`/live/assessment/${a.id}`} className="block">
                        <Card hoverable className="!p-4">
                          <div className="flex items-center gap-4">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-dojo-accent/10">
                              {a.examiner === 'ai' ? (
                                <Bot className="h-5 w-5 text-dojo-accent" />
                              ) : (
                                <ClipboardCheck className="h-5 w-5 text-dojo-accent" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-dojo-text-primary">{a.title}</p>
                              <p className="text-xs text-dojo-text-muted">
                                {formatWhen(a.scheduledAt)} ·{' '}
                                {a.examiner === 'ai'
                                  ? 'AI examiner'
                                  : `${a.waitingCount} waiting`}{' '}
                                · {describeLanguagePair(a.targetLanguage, a.instructionLanguage)}
                              </p>
                            </div>
                            <Badge variant={a.status === 'live' ? 'accent' : 'outline'} className="capitalize">
                              {a.status}
                            </Badge>
                          </div>
                        </Card>
                      </Link>
                    ))
                  )}
                </div>
                {profile && <CreateRoomForm kind="assessment" onCreated={load} profile={profile} />}
              </div>
            );
          }

          if (tabId === 'learners') {
            return <LearnersPanel classes={classOptions} />;
          }

          if (tabId === 'announcements') {
            return profile ? (
              <AnnouncementsPanel profile={profile} classes={classOptions} />
            ) : null;
          }

          return (
            <div className="mt-6">
              <AvailabilityEditor />
            </div>
          );
        }}
      />

      <p className="mt-8 flex items-center gap-2 text-xs text-dojo-text-muted">
        <Calendar className="h-3.5 w-3.5 shrink-0" />
        Learners find your classes and assessments from their course units and the tutors page.
      </p>
    </div>
  );
}
