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
import { Toggle } from '@/components/ui/Toggle';
import { usePageTitle } from '@/lib/hooks/PageTitleContext';
import { useUser } from '@/lib/auth/user-context';
import { TARGET_LANGUAGES, getTargetLangConfig } from '@/lib/language';
import { CLASS_DURATIONS_MINUTES, MAX_CLASS_CAPACITY } from '@/lib/tutors/config';
import { interviewerChoices } from '@/lib/interview/persona';
import { cn } from '@/lib/design-tokens';
import { Bot, Calendar, Check, ClipboardCheck, Plus, Users, Video, Trash2 } from 'lucide-react';

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
  scheduledAt: string;
  durationMinutes: number;
  minutesPerLearner: number;
  waitingCount: number;
  /** 'tutor' | 'ai' — who runs it. */
  examiner: string;
  status: string;
  isTutor: boolean;
}

interface AvailabilitySlot {
  id?: number;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function minutesToTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function timeToMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
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

function CreateRoomForm({ kind, onCreated }: { kind: RoomKind; onCreated: () => void }) {
  const user = useUser();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetLanguage, setTargetLanguage] = useState(user?.preferredTargetLanguage ?? 'ja');
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
  }, [kind, title, description, targetLanguage, scheduledAt, durationMinutes, capacity, minutesPerLearner, examiner, interviewerAvatarId, interviewerBrief, onCreated]);

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
              Language
            </label>
            <select
              id={`${kind}-lang`}
              value={targetLanguage}
              onChange={(e) => setTargetLanguage(e.target.value)}
              className={inputClass}
            >
              {TARGET_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.flag} {l.name}</option>
              ))}
            </select>
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

/* ── Availability editor ─────────────────────────────────────────────── */

function AvailabilityEditor() {
  const [slots, setSlots] = useState<AvailabilitySlot[] | null>(null);
  const [timezone, setTimezone] = useState('UTC');
  const [accepting, setAccepting] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const load = useCallback(
    () =>
      fetch('/api/tutor/availability', { credentials: 'include' })
        .then((res) => res.json())
        .then((data) => {
          if (!data.success) {
            setSlots([]);
            return;
          }
          setSlots(data.slots as AvailabilitySlot[]);
          setTimezone(data.timezone ?? 'UTC');
          setAccepting(Boolean(data.isAcceptingBookings));
        })
        .catch(() => setSlots([])),
    [],
  );

  useEffect(() => { void load(); }, [load]);

  const save = useCallback(async () => {
    if (!slots) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/tutor/availability', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slots, isAcceptingBookings: accepting }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Could not save.');
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }, [slots, accepting]);

  if (!slots) {
    return (
      <Card className="animate-pulse !p-5">
        <div className="h-32 rounded bg-dojo-surface-raised" />
      </Card>
    );
  }

  const update = (index: number, patch: Partial<AvailabilitySlot>) => {
    setSlots((prev) => (prev ?? []).map((s, i) => (i === index ? { ...s, ...patch } : s)));
    setSaved(false);
  };

  return (
    <Card className="!p-5">
      <h3 className="text-sm font-bold text-dojo-text-primary">Weekly availability</h3>
      <p className="mt-1 text-xs leading-relaxed text-dojo-text-muted">
        Times are in <span className="font-medium text-dojo-text-primary">{timezone}</span>, your
        profile timezone. Learners see them converted to their own.
      </p>

      <div className="mt-4">
        <Toggle
          enabled={accepting}
          onChange={(v) => { setAccepting(v); setSaved(false); }}
          label="Accepting bookings"
          description="Off hides you from the tutor list without deleting your schedule."
        />
      </div>

      <div className="mt-4 space-y-2">
        {slots.length === 0 && (
          <p className="text-sm text-dojo-text-muted">
            No hours set. Learners can&apos;t book you until there are some.
          </p>
        )}
        {slots.map((slot, index) => (
          <div key={index} className="flex flex-wrap items-center gap-2">
            <select
              value={slot.dayOfWeek}
              onChange={(e) => update(index, { dayOfWeek: Number(e.target.value) })}
              aria-label="Day"
              className="rounded-(--radius-md) border border-dojo-border bg-dojo-surface px-4 py-2 text-sm text-dojo-text-primary focus:border-dojo-accent focus:outline-none"
            >
              {DAY_NAMES.map((d, i) => (
                <option key={d} value={i}>{d}</option>
              ))}
            </select>
            <input
              type="time"
              value={minutesToTime(slot.startMinute)}
              onChange={(e) => update(index, { startMinute: timeToMinutes(e.target.value) })}
              aria-label="Start time"
              className="rounded-(--radius-md) border border-dojo-border bg-dojo-surface px-4 py-2 text-sm text-dojo-text-primary focus:border-dojo-accent focus:outline-none"
            />
            <span className="text-sm text-dojo-text-muted">to</span>
            <input
              type="time"
              value={minutesToTime(slot.endMinute)}
              onChange={(e) => update(index, { endMinute: timeToMinutes(e.target.value) })}
              aria-label="End time"
              className="rounded-(--radius-md) border border-dojo-border bg-dojo-surface px-4 py-2 text-sm text-dojo-text-primary focus:border-dojo-accent focus:outline-none"
            />
            <button
              type="button"
              onClick={() => {
                setSlots((prev) => (prev ?? []).filter((_, i) => i !== index));
                setSaved(false);
              }}
              aria-label="Remove slot"
              className="rounded-(--radius-md) p-2 text-dojo-text-muted transition-colors hover:text-dojo-danger"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      {error && <p className="mt-4 text-sm text-dojo-danger">{error}</p>}

      <div className="mt-6 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            setSlots((prev) => [...(prev ?? []), { dayOfWeek: 1, startMinute: 9 * 60, endMinute: 10 * 60 }]);
            setSaved(false);
          }}
        >
          <Plus className="h-4 w-4" /> Add hours
        </Button>
        <Button variant="primary" loading={saving} disabled={saving} onClick={save}>
          {saved ? 'Saved — update' : 'Save availability'}
        </Button>
      </div>
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
    { id: 'availability', label: 'Availability' },
  ];

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
                                {getTargetLangConfig(c.targetLanguage).name}
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
                <CreateRoomForm kind="class" onCreated={load} />
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
                                · {getTargetLangConfig(a.targetLanguage).name}
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
                <CreateRoomForm kind="assessment" onCreated={load} />
              </div>
            );
          }

          return (
            <div className={cn('mt-6')}>
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
