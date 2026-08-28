/* ───────────────────────────────────────────────
   Course Detail — structured path: levels → units → lessons.
   Consumes /api/courses/[slug] + /api/progress.
   Lesson state: locked → available → in-progress → completed.
   ─────────────────────────────────────────────── */

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { usePageTitle } from '@/lib/hooks/PageTitleContext';
import { useUser } from '@/lib/auth/user-context';
import { TUTORS_ENABLED } from '@/lib/tutors/config';
import { getTargetLangConfig, getNativeLangName } from '@/lib/language';
import {
  ArrowLeft,
  Check,
  Lock,
  Play,
  Clock,
  Layers,
  BookOpen,
  RotateCcw,
  Users,
  ClipboardList,
} from 'lucide-react';

interface LessonRow {
  id: number;
  unitId: number;
  sequenceOrder: number;
  title: string;
  summary: string | null;
  scenarioId: number | null;
  estimatedMinutes: number;
  isActive: boolean;
}

interface UnitRow {
  id: number;
  levelId: number;
  sequenceOrder: number;
  title: string;
  description: string | null;
  lessons: LessonRow[];
}

interface LevelRow {
  id: number;
  courseId: number;
  sequenceOrder: number;
  title: string;
  description: string | null;
  requiredXp: number;
  units: UnitRow[];
}

interface CourseDetail {
  id: number;
  slug: string;
  title: string;
  description: string;
  difficulty: string;
  icon: string | null;
  levels: LevelRow[];
}

interface LessonProgressRow {
  lessonId: number;
  status: string;
  bestScore: number | null;
  attempts: number;
  completedAt: string | null;
  targetLanguage?: string;
}

interface CourseProgressRow {
  courseId: number;
  lessonsCompleted: number;
  xpEarned: number;
  status: string;
  currentLessonId: number | null;
  targetLanguage?: string;
  nativeLanguage?: string;
  /** JSON array of unit ids the learner has signed off on. */
  acknowledgedUnitIds?: string | null;
}

/** The live class scheduled for a unit, when one is. */
interface UnitClassRow {
  id: number;
  title: string;
  unitId: number | null;
  scheduledAt: string;
  enrolledCount: number;
  capacity: number;
}

type LessonStatus = 'completed' | 'in-progress' | 'available' | 'locked';

interface FlatLesson {
  lesson: LessonRow;
  levelIdx: number;
  unitIdx: number;
  status: LessonStatus;
}

/**
 * Reads `student_progress.acknowledged_unit_ids` — a JSON array in a text
 * column, the same shape `student_lesson_progress.completed_phases` uses.
 * Tolerant of anything malformed: an unreadable column must not break the
 * course page.
 */
function parseAcknowledgedUnits(raw: string | null | undefined): number[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(Number).filter(Number.isInteger) : [];
  } catch {
    return [];
  }
}

const DIFFICULTY_LABEL: Record<string, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

export default function CourseDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useUser();
  const targetLanguage = searchParams.get('target') || user?.preferredTargetLanguage || 'ja';
  const nativeLanguage = searchParams.get('native') || user?.nativeLanguage || 'en';

  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [lessonProgress, setLessonProgress] = useState<LessonProgressRow[]>([]);
  const [courseProgress, setCourseProgress] = useState<CourseProgressRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [startingLesson, setStartingLesson] = useState<number | null>(null);
  const [unitClasses, setUnitClasses] = useState<UnitClassRow[]>([]);
  const [acknowledgedUnits, setAcknowledgedUnits] = useState<number[]>([]);
  const [acknowledging, setAcknowledging] = useState<number | null>(null);

  usePageTitle(course?.title ?? 'Course');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [courseRes, progressRes] = await Promise.all([
          fetch(`/api/courses/${slug}`),
          fetch('/api/progress', { credentials: 'include' }),
        ]);

        const courseData = await courseRes.json();
        let progressData: { success?: boolean; progress?: CourseProgressRow[]; lessonProgress?: LessonProgressRow[] } = {};
        try {
          progressData = await progressRes.json();
        } catch {
          /* unauthenticated — no progress data */
        }

        if (!cancelled) {
          if (courseData.success && courseData.course) {
            setCourse(courseData.course);
          }
          if (Array.isArray(progressData.lessonProgress)) {
            setLessonProgress(
              progressData.lessonProgress.filter((lp) => !lp.targetLanguage || lp.targetLanguage === targetLanguage),
            );
          }
          if (Array.isArray(progressData.progress)) {
            const row = progressData.progress.find(
              (p) => p.courseId === courseData.course?.id && p.targetLanguage === targetLanguage,
            );
            if (row) {
              setCourseProgress(row);
              setAcknowledgedUnits(parseAcknowledgedUnits(row.acknowledgedUnitIds));
            }
          }
        }
      } catch (e) {
        console.error('Failed to load course:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [slug, targetLanguage]);

  // Scheduled live classes, indexed by the unit they belong to. One request
  // for the whole course rather than one per unit — the API already answers
  // "what is coming up" in a single query.
  useEffect(() => {
    if (!TUTORS_ENABLED) return;
    let cancelled = false;
    fetch('/api/classes', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.success || !Array.isArray(data.classes)) return;
        setUnitClasses(data.classes as UnitClassRow[]);
      })
      .catch(() => {
        /* the footer falls back to the tutor list */
      });
    return () => { cancelled = true; };
  }, []);

  const classByUnit = useMemo(() => {
    const map = new Map<number, UnitClassRow>();
    // The list arrives soonest-first, so the first hit for a unit is the next
    // class for it.
    for (const c of unitClasses) {
      if (c.unitId != null && !map.has(c.unitId)) map.set(c.unitId, c);
    }
    return map;
  }, [unitClasses]);

  async function acknowledgeUnit(unitId: number) {
    setAcknowledging(unitId);
    try {
      const res = await fetch(`/api/progress/units/${unitId}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetLanguage }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success && Array.isArray(data.acknowledgedUnitIds)) {
        setAcknowledgedUnits(data.acknowledgedUnitIds as number[]);
      }
    } catch {
      /* leave the button as it was; the learner can try again */
    } finally {
      setAcknowledging(null);
    }
  }

  const { flatLessons, totalLessons, completedCount } = useMemo(() => {
    if (!course) return { flatLessons: [] as FlatLesson[], totalLessons: 0, completedCount: 0 };

    const completedIds = new Set(
      lessonProgress.filter((lp) => lp.status === 'completed').map((lp) => lp.lessonId),
    );
    const startedIds = new Set(
      lessonProgress.filter((lp) => lp.status !== 'completed').map((lp) => lp.lessonId),
    );

    const flat: FlatLesson[] = [];
    course.levels.forEach((level, levelIdx) => {
      level.units.forEach((unit, unitIdx) => {
        unit.lessons
          .filter((l) => l.isActive)
          .forEach((lesson) => {
            flat.push({ lesson, levelIdx, unitIdx, status: 'locked' });
          });
      });
    });

    let lockAfter = false;
    return {
      flatLessons: flat.map((f) => {
        let status: LessonStatus;
        if (completedIds.has(f.lesson.id)) {
          status = 'completed';
        } else if (lockAfter) {
          status = 'locked';
        } else if (startedIds.has(f.lesson.id)) {
          status = 'in-progress';
        } else {
          status = 'available';
        }
        lockAfter = status !== 'completed';
        return { ...f, status };
      }),
      totalLessons: flat.length,
      completedCount: flat.filter((f) => completedIds.has(f.lesson.id)).length,
    };
  }, [course, lessonProgress]);

  const continueTarget = useMemo(
    () => flatLessons.find((f) => f.status === 'available' || f.status === 'in-progress') ?? null,
    [flatLessons],
  );

  const overallPct = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;

  async function startLesson(flat: FlatLesson) {
    const lesson = flat.lesson;
    if (!lesson.scenarioId) return;
    setStartingLesson(lesson.id);
    try {
      if (flat.status !== 'completed') {
        await fetch(`/api/progress/lessons/${lesson.id}`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ phaseKey: 'learn', targetLanguage, nativeLanguage }),
        });
      }
      const res = await fetch('/api/sessions', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          scenarioId: lesson.scenarioId,
          lessonId: lesson.id,
          targetLanguage,
          nativeLanguage,
        }),
      });
      const data = await res.json();
      if (data.success && data.session?.id) {
        router.push(`/session/${data.session.id}`);
        return;
      }
      console.error('Failed to start lesson:', data.error);
    } catch (e) {
      console.error('Start lesson failed:', e);
    }
    setStartingLesson(null);
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl p-6 lg:p-10">
        <div className="animate-pulse space-y-6">
          <div className="h-6 w-48 rounded bg-dojo-surface" />
          <div className="h-40 rounded-2xl bg-dojo-surface" />
          <div className="h-28 rounded-xl bg-dojo-surface" />
          <div className="h-28 rounded-xl bg-dojo-surface" />
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="mx-auto max-w-5xl p-6 lg:p-10">
        <h1 className="text-2xl font-bold text-dojo-text-primary">Course not found</h1>
        <Link href="/courses" className="text-dojo-accent mt-2 inline-block text-sm hover:underline">
          Back to Learning Paths
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-6 lg:p-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/courses"
          className="inline-flex items-center gap-1.5 text-sm text-dojo-text-muted hover:text-dojo-text-primary transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Learning Paths
        </Link>
        <Link
          href={`/courses/${slug}/grades?target=${encodeURIComponent(targetLanguage)}`}
          className="inline-flex items-center gap-2 rounded-(--radius-md) border border-dojo-border bg-dojo-surface px-4 py-2 text-sm text-dojo-text-primary transition-colors hover:bg-dojo-surface-raised"
        >
          <ClipboardList className="h-4 w-4" />
          Grades
        </Link>
      </div>

      {/* ── Hero ── */}
      <div className="relative overflow-hidden rounded-3xl border border-dojo-border bg-dojo-surface-raised p-8 shadow-2xl mb-10">
        <div className="absolute -top-20 -right-20 h-56 w-56 rounded-full bg-dojo-accent/15 blur-[80px]" />
        <div className="absolute -bottom-20 -left-20 h-56 w-56 rounded-full bg-dojo-success/10 blur-[80px]" />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-3">
              <Badge variant={course.difficulty as 'beginner'}>
                {DIFFICULTY_LABEL[course.difficulty] ?? course.difficulty}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                {getTargetLangConfig(targetLanguage).name}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                → {getNativeLangName(nativeLanguage)}
              </Badge>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-dojo-text-primary tracking-tight leading-none mb-3">
              {course.title}
            </h1>
            <p className="text-base text-dojo-text-muted leading-relaxed max-w-2xl mb-6">
              {course.description}
            </p>

            <div className="flex items-center gap-6">
              <div className="flex-1 min-w-[160px]">
                <div className="flex items-center justify-between text-xs font-bold text-dojo-text-muted mb-1">
                  <span>{completedCount} / {totalLessons} lessons</span>
                  <span className="text-dojo-accent">{overallPct}%</span>
                </div>
                <ProgressBar value={overallPct} color="accent" size="md" />
              </div>
              {courseProgress && (
                <span className="flex items-center gap-1.5 text-sm font-bold text-dojo-text-muted shrink-0">
                  <Layers className="h-4 w-4 text-dojo-success" />
                  {courseProgress.xpEarned} XP earned
                </span>
              )}
            </div>
          </div>

          <div className="shrink-0 md:w-56">
            {continueTarget ? (
              <Button
                variant="primary"
                size="lg"
                className="w-full"
                onClick={() => startLesson(continueTarget)}
                loading={startingLesson === continueTarget.lesson.id}
              >
                <Play className="h-4 w-4 fill-current" />
                {courseProgress?.currentLessonId === continueTarget.lesson.id ? 'Continue' : 'Start Learning'}
              </Button>
            ) : totalLessons > 0 ? (
              <div className="flex w-full flex-col items-center gap-2 rounded-xl border border-dojo-success/30 bg-dojo-success/10 p-4 text-center">
                <Check className="h-6 w-6 text-dojo-success" />
                <p className="text-sm font-bold text-dojo-success">Course completed</p>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── Levels ── */}
      <div className="space-y-8">
        {course.levels.map((level, levelIdx) => {
          const levelLessons = flatLessons.filter((f) => f.levelIdx === levelIdx);
          if (levelLessons.length === 0) return null;
          const levelDone = levelLessons.every((f) => f.status === 'completed');

          return (
            <section key={level.id} className="space-y-4">
              <div className="flex items-center gap-3">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${levelDone ? 'bg-dojo-success/20 text-dojo-success' : 'bg-dojo-accent/20 text-dojo-accent'}`}>
                  <BookOpen className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-bold text-dojo-text-primary leading-snug">
                    {level.title}
                  </h2>
                  {level.description && (
                    <p className="text-sm text-dojo-text-muted leading-relaxed">{level.description}</p>
                  )}
                </div>
                <Badge variant="outline" className="text-[10px] shrink-0">
                  {level.requiredXp > 0 ? `${level.requiredXp} XP` : 'Start'}
                </Badge>
              </div>

              <div className="space-y-4">
                {level.units.map((unit, unitIdx) => (
                  // `id` is the anchor a finished session lands on — see
                  // continueHref in lib/curriculum/continue-href.ts. scroll-mt
                  // keeps the heading clear of the sticky app header.
                  <Card key={unit.id} id={`unit-${unit.id}`} className="!p-5 scroll-mt-24">
                    <div className="mb-3">
                      <h3 className="text-sm font-bold text-dojo-text-primary">
                        Unit {unit.sequenceOrder} — {unit.title}
                      </h3>
                      {unit.description && (
                        <p className="mt-0.5 text-xs text-dojo-text-muted leading-relaxed">{unit.description}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      {flatLessons
                        .filter((f) => f.levelIdx === levelIdx && f.unitIdx === unitIdx)
                        .map((f) => (
                          <div
                            key={f.lesson.id}
                            id={`lesson-${f.lesson.id}`}
                            className="flex items-center gap-3 rounded-xl border border-dojo-border bg-dojo-surface/60 px-4 py-3 scroll-mt-24 target:border-dojo-accent target:ring-2 target:ring-dojo-accent/30"
                          >
                            <div
                              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                                f.status === 'completed'
                                  ? 'bg-dojo-success/20 text-dojo-success'
                                  : f.status === 'locked'
                                    ? 'bg-dojo-border/60 text-dojo-text-muted/40'
                                    : 'bg-dojo-accent/20 text-dojo-accent'
                              }`}
                            >
                              {f.status === 'completed' ? (
                                <Check className="h-4 w-4" />
                              ) : f.status === 'locked' ? (
                                <Lock className="h-3.5 w-3.5" />
                              ) : (
                                <span className="text-xs font-bold">{f.lesson.sequenceOrder}</span>
                              )}
                            </div>

                            <div className="flex-1 min-w-0">
                              <p
                                className={`text-sm font-semibold truncate ${
                                  f.status === 'locked' ? 'text-dojo-text-muted/50' : 'text-dojo-text-primary'
                                }`}
                              >
                                {f.lesson.title}
                              </p>
                              <div className="flex items-center gap-3 mt-0.5">
                                <span className="flex items-center gap-1 text-[11px] text-dojo-text-muted">
                                  <Clock className="h-3 w-3" />
                                  {f.lesson.estimatedMinutes} min
                                </span>
                                {f.status === 'completed' && (
                                  <span className="text-[11px] font-bold text-dojo-success">Completed</span>
                                )}
                                {f.status === 'in-progress' && (
                                  <span className="text-[11px] font-bold text-dojo-accent">In progress</span>
                                )}
                              </div>
                            </div>

                            {f.status === 'completed' ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="shrink-0 text-xs"
                                onClick={() => startLesson(f)}
                                loading={startingLesson === f.lesson.id}
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                                Try Again
                              </Button>
                            ) : f.status === 'locked' ? (
                              <span className="shrink-0 px-3 py-1.5 text-xs font-semibold text-dojo-text-muted/50">
                                Locked
                              </span>
                            ) : (
                              <Button
                                variant={f.status === 'in-progress' ? 'secondary' : 'primary'}
                                size="sm"
                                className="shrink-0"
                                onClick={() => startLesson(f)}
                                loading={startingLesson === f.lesson.id}
                              >
                                {f.status === 'in-progress' ? 'Continue' : 'Start'}
                                <Play className="h-3.5 w-3.5 fill-current" />
                              </Button>
                            )}
                          </div>
                        ))}
                    </div>

                    {/* Appears only once every lesson in the unit is done. A
                        unit still in progress has nothing to sign off and no
                        reason to be sent to a live lesson for it yet. */}
                    {(() => {
                      const unitLessons = flatLessons.filter(
                        (f) => f.levelIdx === levelIdx && f.unitIdx === unitIdx,
                      );
                      const unitComplete =
                        unitLessons.length > 0 &&
                        unitLessons.every((f) => f.status === 'completed');
                      if (!unitComplete) return null;

                      const acknowledged = acknowledgedUnits.includes(unit.id);
                      const liveClass = classByUnit.get(unit.id) ?? null;

                      return (
                        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-dojo-border pt-4">
                          {acknowledged ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-dojo-success-strong">
                              <Check className="h-3.5 w-3.5" /> Unit finished
                            </span>
                          ) : (
                            <Button
                              variant="secondary"
                              size="sm"
                              loading={acknowledging === unit.id}
                              onClick={() => acknowledgeUnit(unit.id)}
                            >
                              <ClipboardList className="h-3.5 w-3.5" />
                              Mark unit as finished
                            </Button>
                          )}

                          {TUTORS_ENABLED && (
                            liveClass ? (
                              <Link
                                href={`/live/class/${liveClass.id}`}
                                className="inline-flex items-center gap-2 rounded-(--radius-md) bg-dojo-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-dojo-accent/90"
                              >
                                <Users className="h-3.5 w-3.5" />
                                Join live lesson · {new Date(liveClass.scheduledAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                              </Link>
                            ) : (
                              <Link
                                href="/tutors"
                                className="inline-flex items-center gap-2 rounded-(--radius-md) border border-dojo-border bg-dojo-surface px-4 py-2 text-sm text-dojo-text-primary transition-colors hover:bg-dojo-surface-raised"
                              >
                                <Users className="h-3.5 w-3.5" />
                                No live lesson scheduled — find a tutor
                              </Link>
                            )
                          )}
                        </div>
                      );
                    })()}
                  </Card>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
