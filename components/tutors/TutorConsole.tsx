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
import { composeRoomTitle } from '@/lib/curriculum/room-title';
import { cn } from '@/lib/design-tokens';
import { Bot, Calendar, Check, ClipboardCheck, Plus, Radio, Users, Video, X } from 'lucide-react';

const INTERVIEWER_CHOICES = interviewerChoices();

interface BookingRow {
  id: number;
  tutorName: string;
  learnerName: string | null;
  scheduledAt: string;
  durationMinutes: number;
  status: string;
  purpose: string;
  isTutor: boolean;
}

/** What each booking status means to the person reading it, in plain words. */
function describeBookingStatus(status: string, isTutor: boolean): string {
  if (status === 'requested') {
    return isTutor ? 'Waiting on you to confirm' : 'Waiting for the tutor to confirm';
  }
  if (status === 'confirmed') return 'Confirmed — the room opens at the start time';
  if (status === 'completed') return 'Finished';
  if (status === 'cancelled') return 'Cancelled';
  return status;
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

/** The slice of /api/courses and /api/courses/[slug] the unit picker needs. */
interface CourseOption {
  id: number;
  slug: string;
  title: string;
}
interface UnitOption {
  id: number;
  title: string;
  sequenceOrder: number;
}
interface LevelOption {
  id: number;
  title: string;
  sequenceOrder: number;
  units: UnitOption[];
}

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
  // A drop-in opens the moment it is created; a scheduled room needs a date.
  // One flag rather than a sentinel date, because it also decides the status
  // the row is born in — see the `startNow` branch in POST /api/classes.
  const [startNow, setStartNow] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');

  // Where in the curriculum this room sits. All three optional: a standalone
  // conversation hour belongs to no unit.
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [levels, setLevels] = useState<LevelOption[]>([]);
  const [courseSlug, setCourseSlug] = useState('');
  const [levelId, setLevelId] = useState<number | null>(null);
  const [unitId, setUnitId] = useState<number | null>(null);
  // Set the first time the tutor edits the title themselves. From then on the
  // unit picker stops rewriting it — a tutor who has named a room "retake for
  // Thursday's absentees" must not lose it to a change of unit.
  const [titleDirty, setTitleDirty] = useState(false);

  const [durationMinutes, setDurationMinutes] = useState(60);
  const [capacity, setCapacity] = useState(12);
  const [minutesPerLearner, setMinutesPerLearner] = useState(10);
  const [examiner, setExaminer] = useState<'tutor' | 'ai'>('tutor');
  const [interviewerAvatarId, setInterviewerAvatarId] = useState(INTERVIEWER_CHOICES[0].avatarId);
  const [interviewerBrief, setInterviewerBrief] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // The course catalogue, for the unit picker. Failing quietly is right: the
  // pin is optional, so a course list that would not load must not stop a
  // tutor opening a room.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/courses', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.success || !Array.isArray(data.courses)) return;
        setCourses(data.courses as CourseOption[]);
      })
      .catch(() => { /* the picker stays empty; the room is still creatable */ });
    return () => { cancelled = true; };
  }, []);

  // Levels and units for the chosen course. `/api/courses/[slug]` already
  // returns the whole tree, so one request covers both selects. Only the
  // fetch lives in an effect; the selection resets belong to the event that
  // caused them, in `pickCourse` below.
  useEffect(() => {
    if (!courseSlug) return;
    let cancelled = false;
    fetch(`/api/courses/${courseSlug}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.success) return;
        setLevels((data.course?.levels ?? []) as LevelOption[]);
      })
      .catch(() => { if (!cancelled) setLevels([]); });
    return () => { cancelled = true; };
  }, [courseSlug]);

  const selectedLevel = levels.find((l) => l.id === levelId) ?? null;
  const selectedUnit = selectedLevel?.units.find((u) => u.id === unitId) ?? null;
  const selectedCourseId = courses.find((c) => c.slug === courseSlug)?.id ?? null;

  function pickCourse(slug: string) {
    setCourseSlug(slug);
    // A level and a unit from the previous course mean nothing under this one.
    setLevels([]);
    setLevelId(null);
    setUnitId(null);
  }

  /**
   * Picking a unit also names the room after it — until the tutor names it
   * themselves, which `titleDirty` records. Done here rather than in an effect
   * because it is a consequence of the choice, not of the state: a tutor who
   * clears the unit keeps the title they were shown.
   */
  function pickUnit(id: number | null) {
    setUnitId(id);
    if (titleDirty || id == null) return;
    const unit = selectedLevel?.units.find((u) => u.id === id);
    if (!unit) return;
    setTitle(composeRoomTitle({
      unitSequence: unit.sequenceOrder,
      unitTitle: unit.title,
      kind,
    }));
  }

  const submit = useCallback(async () => {
    setError('');
    const iso = startNow ? null : localInputToIso(scheduledAt);
    if (!title.trim()) return setError('Give it a title.');
    if (!startNow && !iso) return setError('Pick a date and time.');
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
          startNow,
          scheduledAt: iso,
          courseId: selectedCourseId,
          unitId,
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
      setTitleDirty(false);
      setDescription('');
      setScheduledAt('');
      setInterviewerBrief('');
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create it.');
    } finally {
      setSaving(false);
    }
  }, [kind, title, description, targetLanguage, instructionLanguage, startNow, scheduledAt, selectedCourseId, unitId, durationMinutes, capacity, minutesPerLearner, examiner, interviewerAvatarId, interviewerBrief, onCreated]);

  const inputClass =
    'w-full rounded-(--radius-md) border border-dojo-border bg-dojo-surface px-4 py-2 text-sm text-dojo-text-primary placeholder:text-dojo-text-muted focus:border-dojo-accent focus:outline-none';

  return (
    <Card className="!p-5">
      <h3 className="text-sm font-bold text-dojo-text-primary">
        {startNow
          ? (kind === 'class' ? 'Start a class now' : 'Start an assessment now')
          : (kind === 'class' ? 'Schedule a class' : 'Schedule an assessment')}
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-dojo-text-muted">
        {kind === 'class'
          ? 'Everyone joins together. Good for a conversation hour or the live lesson for a unit.'
          : 'Learners queue and you admit them one at a time, grading each as you go — or an AI examiner interviews each of them for you.'}
      </p>

      <div className="mt-4 space-y-4">
        {/* Where in the curriculum this sits. Above the title because it names
            the title — and because a room pinned to a unit is the one that
            reaches learners where they finished it, on the course page. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor={`${kind}-course`} className="mb-2 block text-sm text-dojo-text-primary">
              Course <span className="text-dojo-text-muted">(optional)</span>
            </label>
            <select
              id={`${kind}-course`}
              value={courseSlug}
              onChange={(e) => pickCourse(e.target.value)}
              className={inputClass}
            >
              <option value="">No course</option>
              {courses.map((c) => (
                <option key={c.id} value={c.slug}>{c.title}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor={`${kind}-level`} className="mb-2 block text-sm text-dojo-text-primary">
              Level
            </label>
            <select
              id={`${kind}-level`}
              value={levelId ?? ''}
              disabled={levels.length === 0}
              onChange={(e) => {
                setLevelId(e.target.value ? Number(e.target.value) : null);
                setUnitId(null);
              }}
              className={cn(inputClass, levels.length === 0 && 'opacity-50')}
            >
              <option value="">Any level</option>
              {levels.map((l) => (
                <option key={l.id} value={l.id}>{l.sequenceOrder}. {l.title}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor={`${kind}-unit`} className="mb-2 block text-sm text-dojo-text-primary">
              Unit
            </label>
            <select
              id={`${kind}-unit`}
              value={unitId ?? ''}
              disabled={!selectedLevel}
              onChange={(e) => pickUnit(e.target.value ? Number(e.target.value) : null)}
              className={cn(inputClass, !selectedLevel && 'opacity-50')}
            >
              <option value="">No unit</option>
              {(selectedLevel?.units ?? []).map((u) => (
                <option key={u.id} value={u.id}>Unit {u.sequenceOrder} · {u.title}</option>
              ))}
            </select>
            <p className="mt-1.5 text-[11px] leading-relaxed text-dojo-text-muted">
              {selectedUnit
                ? 'Learners see this on the course page when they reach the unit.'
                : 'Pin it to a unit and it appears on the course page there.'}
            </p>
          </div>
        </div>

        <div>
          <label htmlFor={`${kind}-title`} className="mb-2 block text-sm text-dojo-text-primary">
            Title
          </label>
          <input
            id={`${kind}-title`}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setTitleDirty(true);
            }}
            maxLength={150}
            placeholder={kind === 'class' ? 'Ordering food — live practice' : 'Unit 2 speaking check'}
            className={inputClass}
          />
          {selectedUnit && !titleDirty && (
            <p className="mt-1.5 text-[11px] leading-relaxed text-dojo-text-muted">
              Named from the unit you picked. Type over it to use your own.
            </p>
          )}
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
            <span className="mb-2 block text-sm text-dojo-text-primary">When</span>
            {/* Two mutually exclusive answers, so a segmented pair rather than
                a switch: "start now" is not the on-state of "schedule". */}
            <div className="flex rounded-(--radius-md) border border-dojo-border p-1">
              {([false, true] as const).map((now) => (
                <button
                  key={String(now)}
                  type="button"
                  aria-pressed={startNow === now}
                  onClick={() => setStartNow(now)}
                  className={cn(
                    'flex-1 rounded-(--radius-sm) px-3 py-1.5 text-xs font-semibold transition-colors',
                    startNow === now
                      ? 'bg-dojo-accent text-white'
                      : 'text-dojo-text-muted hover:text-dojo-text-primary',
                  )}
                >
                  {now ? 'Start now' : 'Schedule'}
                </button>
              ))}
            </div>
            {startNow ? (
              <p className="mt-1.5 text-[11px] leading-relaxed text-dojo-text-muted">
                Opens the moment you create it, and your learners are notified.
              </p>
            ) : (
              <input
                id={`${kind}-when`}
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                aria-label="Date and time"
                className={cn(inputClass, 'mt-2')}
              />
            )}
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
        {startNow ? <Radio className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        {startNow ? 'Start now' : 'Schedule'}
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

  const [decidingBooking, setDecidingBooking] = useState<number | null>(null);

  /**
   * Answering a booking request from the list it appears in.
   *
   * Reloads rather than patching local state: the same PATCH also notifies the
   * learner, and a card showing "confirmed" while the write is still in flight
   * would be claiming something the learner has not been told.
   */
  const decideBooking = useCallback(
    async (bookingId: number, status: 'confirmed' | 'cancelled') => {
      setDecidingBooking(bookingId);
      try {
        await fetch(`/api/bookings/${bookingId}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ status }),
        });
        await load();
      } catch {
        /* the card stays as it was; the tutor can try again */
      } finally {
        setDecidingBooking(null);
      }
    },
    [load],
  );

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
                    <Card key={b.id} className="!p-4">
                      <div className="flex items-center gap-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-dojo-accent/10">
                          <Video className="h-5 w-5 text-dojo-accent" />
                        </div>
                        <Link href={`/live/${b.id}`} className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-dojo-text-primary">
                            {b.isTutor ? b.learnerName ?? 'A learner' : b.tutorName}
                            {b.purpose === 'evaluation' && ' · Evaluation'}
                          </p>
                          <p className="text-xs text-dojo-text-muted">
                            {formatWhen(b.scheduledAt)} · {b.durationMinutes} min ·{' '}
                            {describeBookingStatus(b.status, b.isTutor)}
                          </p>
                        </Link>
                        {/* Confirming used to mean opening the room page to do
                            it. A request the tutor cannot answer from the list
                            they see it in is a request that sits unanswered. */}
                        {b.isTutor && b.status === 'requested' ? (
                          <div className="flex shrink-0 gap-2">
                            <Button
                              variant="primary"
                              size="sm"
                              loading={decidingBooking === b.id}
                              onClick={() => decideBooking(b.id, 'confirmed')}
                            >
                              <Check className="h-3.5 w-3.5" /> Confirm
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={decidingBooking === b.id}
                              onClick={() => decideBooking(b.id, 'cancelled')}
                            >
                              <X className="h-3.5 w-3.5" /> Decline
                            </Button>
                          </div>
                        ) : (
                          <Badge
                            variant={b.status === 'confirmed' ? 'accent' : 'outline'}
                            className="shrink-0 capitalize"
                          >
                            {b.status}
                          </Badge>
                        )}
                      </div>
                    </Card>
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
