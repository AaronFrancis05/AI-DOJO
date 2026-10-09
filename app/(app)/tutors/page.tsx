/* ───────────────────────────────────────────────
   Tutors — find a human tutor and see your bookings.
   Gated behind NEXT_PUBLIC_TUTORS_ENABLED.
   ─────────────────────────────────────────────── */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { LiveBadge } from '@/components/ui/LiveBadge';

import { Avatar } from '@/components/ui/Avatar';
import { usePageTitle } from '@/lib/hooks/PageTitleContext';
import { useUser } from '@/lib/auth/user-context';
import { TUTORS_ENABLED } from '@/lib/tutors/config';
import { getTargetLangConfig, getNativeLangName } from '@/lib/language';
import { useUiLocale } from '@/lib/language-context';
import { formatCurrency, formatDate } from '@/lib/i18n/format';
import { TranslatedText } from '@/components/ui/TranslatedText';
import { TrustBadge, type TutorTrustBadge } from '@/components/tutors/TrustBadge';
import { Video, Calendar, ArrowRight, GraduationCap, Users, ClipboardCheck, Bot } from 'lucide-react';

interface TutorRow {
  id: number;
  name: string;
  headline: string;
  bio: string | null;
  languages: string[];
  instructionLanguages: string[];
  hourlyRateCents: number;
  currency: string;
  timezone: string;
  avatarSrc: string | null;
  // Present while hybrid tutoring is on (PLAN.md 4.4, 4.8).
  trust?: TutorTrustBadge | null;
  sharesLanguage?: boolean;
}

interface BookingRow {
  id: number;
  tutorName: string;
  scheduledAt: string;
  durationMinutes: number;
  status: string;
  purpose: string;
  targetLanguage: string;
  isTutor: boolean;
}

interface LiveLessonRow {
  id: number;
  title: string;
  tutorName: string;
  targetLanguage: string;
  scheduledAt: string;
  durationMinutes: number;
  capacity: number;
  enrolledCount: number;
  myEnrollmentStatus: string | null;
  /** 'scheduled' | 'live' | 'completed' | 'cancelled'. */
  status: string;
}

interface AssessmentRow {
  id: number;
  title: string;
  tutorName: string;
  targetLanguage: string;
  scheduledAt: string;
  minutesPerLearner: number;
  waitingCount: number;
  myQueueState: string | null;
  /** 'tutor' | 'ai' — an AI-examined assessment has no line to wait in. */
  examiner: string;
  /** 'scheduled' | 'live' | 'completed' | 'cancelled'. */
  status: string;
}

function formatMoney(cents: number, currency: string, locale: string): string {
  if (cents === 0) return 'Free';
  return formatCurrency(cents / 100, currency, locale);
}

function formatWhen(iso: string, locale: string): string {
  return formatDate(iso, locale, {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

/** Rooms that are running now, then the rest in the order they arrived. */
function liveFirst<T extends { status: string }>(rows: T[]): T[] {
  return [
    ...rows.filter((r) => r.status === 'live'),
    ...rows.filter((r) => r.status !== 'live'),
  ];
}

const TUTORS_BLURB =
  'Book a live tutor, join a group lesson, or sit an assessment — human practice alongside the AI.';

const STATUS_VARIANT: Record<string, 'accent' | 'success' | 'default' | 'outline'> = {
  requested: 'outline',
  confirmed: 'accent',
  completed: 'success',
  cancelled: 'default',
};

export default function TutorsPage() {
  const { locale } = useUiLocale();
  usePageTitle('Tutors');
  const router = useRouter();
  const user = useUser();
  const [tutors, setTutors] = useState<TutorRow[]>([]);
  // An A0 learner is pointed at the AI and the starter unit before booking (PLAN.md 4.8 part 2).
  const [warnBeforeBooking, setWarnBeforeBooking] = useState(false);
  const [upcoming, setUpcoming] = useState<BookingRow[]>([]);
  const [liveLessons, setLiveLessons] = useState<LiveLessonRow[]>([]);
  const [assessments, setAssessments] = useState<AssessmentRow[]>([]);
  // Starts false when the feature is off, so the disabled path never has to
  // call setState from inside an effect just to stop a spinner.
  const [loading, setLoading] = useState(TUTORS_ENABLED);

  useEffect(() => {
    if (!TUTORS_ENABLED) return;
    Promise.all([
      fetch('/api/tutors', { credentials: 'include' }).then((r) => r.json()).catch(() => ({})),
      fetch('/api/bookings', { credentials: 'include' }).then((r) => r.json()).catch(() => ({})),
      fetch('/api/live-lessons', { credentials: 'include' }).then((r) => r.json()).catch(() => ({})),
      fetch('/api/assessments', { credentials: 'include' }).then((r) => r.json()).catch(() => ({})),
    ]).then(([t, b, c, a]) => {
      if (Array.isArray(t.tutors)) setTutors(t.tutors);
      setWarnBeforeBooking(Boolean(t.warnBeforeBooking));
      // Rooms already running come first. Both lists arrive soonest-first,
      // which is the right order for a diary and the wrong one for a room the
      // learner can only walk into while it is open.
      if (Array.isArray(c.liveLessons)) setLiveLessons(liveFirst(c.liveLessons as LiveLessonRow[]));
      if (Array.isArray(a.assessments)) {
        setAssessments(liveFirst(a.assessments as AssessmentRow[]));
      }
      if (Array.isArray(b.bookings)) {
        // Filtered here rather than during render: "is this in the future?"
        // depends on the current time, which is not a pure value to read
        // while rendering.
        const cutoff = Date.now() - 60 * 60 * 1000;
        setUpcoming(
          (b.bookings as BookingRow[]).filter(
            (x) => x.status !== 'cancelled' && new Date(x.scheduledAt).getTime() > cutoff,
          ),
        );
      }
    }).finally(() => setLoading(false));
  }, []);

  // Ships dark until Stream credentials are configured. Showing a booking
  // flow that cannot connect would be worse than showing nothing.
  if (!TUTORS_ENABLED) {
    return (
      <div className="mx-auto w-full max-w-7xl p-6 lg:p-10">
        <div className="mb-8">
          <h1 className="hidden md:block text-3xl font-bold tracking-tight leading-none text-dojo-text-primary">
            Tutors
          </h1>
          <p className="mt-2 text-base text-dojo-text-muted leading-relaxed">
            {TUTORS_BLURB}
          </p>
        </div>
        <div className="max-w-2xl">
        <Card className="py-12 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-dojo-accent/10">
            <GraduationCap className="h-6 w-6 text-dojo-accent" />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-dojo-text-primary">
            Live tutoring is coming
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-dojo-text-muted">
            Practise with a real tutor over video, or have one check what the AI has been
            teaching you. Not available on this deployment yet.
          </p>
        </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl p-6 lg:p-10">
      <div className="mb-8">
        <h1 className="hidden md:block text-3xl font-bold tracking-tight leading-none text-dojo-text-primary">
          Tutors
        </h1>
        <p className="mt-2 text-base text-dojo-text-muted leading-relaxed">
          {TUTORS_BLURB}
        </p>
      </div>

      {upcoming.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-dojo-text-muted">
            Upcoming sessions
          </h2>
          <div className="space-y-3">
            {upcoming.map((b) => (
              <Card key={b.id} hoverable className="p-4! cursor-pointer" onClick={() => router.push(`/live/${b.id}`)}>
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-dojo-accent/10">
                    <Video className="h-5 w-5 text-dojo-accent" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-dojo-text-primary">
                      {b.isTutor ? 'Teaching' : `With ${b.tutorName}`}
                      {b.purpose === 'evaluation' && ' · Evaluation'}
                    </p>
                    <p className="text-xs text-dojo-text-muted">
                      {formatWhen(b.scheduledAt, locale)} · {b.durationMinutes} min
                    </p>
                  </div>
                  <Badge variant={STATUS_VARIANT[b.status] ?? 'default'} className="capitalize">
                    {b.status}
                  </Badge>
                  <ArrowRight className="h-4 w-4 shrink-0 text-dojo-text-muted" />
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {liveLessons.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-dojo-text-muted">
            Live lessons
          </h2>
          <div className="space-y-3">
            {liveLessons.map((c) => (
              <Card
                key={c.id}
                hoverable
                className="p-4! cursor-pointer"
                onClick={() => router.push(`/live/lesson/${c.id}`)}
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-dojo-accent/10">
                    <Users className="h-5 w-5 text-dojo-accent" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-dojo-text-primary">{c.title}</p>
                    <p className="text-xs text-dojo-text-muted">
                      {c.tutorName} ·{' '}
                      {c.status === 'live' ? 'running now' : formatWhen(c.scheduledAt, locale)} ·{' '}
                      {c.enrolledCount}/{c.capacity} enrolled
                    </p>
                  </div>
                  {c.status === 'live' && <LiveBadge className="shrink-0" />}
                  <Badge variant="outline">{getTargetLangConfig(c.targetLanguage).name}</Badge>
                  {c.myEnrollmentStatus && c.myEnrollmentStatus !== 'cancelled' && (
                    <Badge variant="accent">Enrolled</Badge>
                  )}
                  <ArrowRight className="h-4 w-4 shrink-0 text-dojo-text-muted" />
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {assessments.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-dojo-text-muted">
            Assessments
          </h2>
          <div className="space-y-3">
            {assessments.map((a) => (
              <Card
                key={a.id}
                hoverable
                className="p-4! cursor-pointer"
                onClick={() => router.push(`/live/assessment/${a.id}`)}
              >
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
                      {a.tutorName} ·{' '}
                      {a.status === 'live' ? 'open now' : formatWhen(a.scheduledAt, locale)} ·{' '}
                      {a.examiner === 'ai'
                        ? `AI examiner · ${a.minutesPerLearner} min`
                        : `${a.waitingCount} waiting`}
                    </p>
                  </div>
                  {a.status === 'live' && <LiveBadge className="shrink-0" />}
                  <Badge variant="outline">{getTargetLangConfig(a.targetLanguage).name}</Badge>
                  {a.myQueueState && (
                    <Badge variant="accent" className="capitalize">
                      {/* "Admitted" is a queue word, and there is no queue when the
                          examiner is the AI — every learner is admitted at once. */}
                      {a.examiner === 'ai'
                        ? a.myQueueState === 'done'
                          ? 'Finished'
                          : 'Started'
                        : a.myQueueState}
                    </Badge>
                  )}
                  <ArrowRight className="h-4 w-4 shrink-0 text-dojo-text-muted" />
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {!loading && !user?.canBrowseTutors && upcoming.length === 0 && liveLessons.length === 0 && assessments.length === 0 && (
        <Card className="py-12 text-center">
          <p className="text-sm text-dojo-text-muted">
            Tutoring isn&apos;t available for your organization yet.
          </p>
        </Card>
      )}

      {user?.canBrowseTutors && (
      <section>
        <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-dojo-text-muted">
          Available tutors
        </h2>

        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[0, 1].map((i) => (
              <Card key={i} className="animate-pulse p-5!">
                <div className="h-10 w-10 rounded-full bg-dojo-surface-raised" />
                <div className="mt-4 h-4 w-2/3 rounded bg-dojo-surface-raised" />
                <div className="mt-2 h-3 w-1/2 rounded bg-dojo-surface-raised" />
              </Card>
            ))}
          </div>
        ) : tutors.length === 0 ? (
          <Card className="border-dashed py-12 text-center">
            <p className="text-sm text-dojo-text-muted">
              No tutors are taking bookings yet. Check back soon.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {warnBeforeBooking && (
              <Card className="p-5! sm:col-span-2">
                <p className="text-sm leading-relaxed text-dojo-text-primary">
                  You are just starting out. Practise with the AI first and finish the Classroom English
                  starter unit — then a tutor lesson will go much further.{' '}
                  <Link href="/placement" className="text-dojo-accent">See your level</Link>
                </p>
              </Card>
            )}
            {tutors.map((t) => (
              <Card key={t.id} hoverable className="p-5!">
                <div className="flex items-start gap-3">
                  <Avatar src={t.avatarSrc ?? undefined} name={t.name} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-dojo-text-primary">{t.name}</p>
                    <p className="mt-1 text-xs leading-relaxed text-dojo-text-muted">{t.headline}</p>
                  </div>
                </div>

                {/* Two capabilities, shown separately: what they teach, and
                    what they can teach it in. A learner picking a tutor cares
                    about both — a Japanese tutor who cannot explain in Luganda
                    is the wrong tutor for a Luganda speaker. */}
                <div className="mt-4 flex flex-wrap gap-2">
                  {t.languages.map((code) => (
                    <Badge key={code} variant="outline">
                      {getTargetLangConfig(code).name}
                    </Badge>
                  ))}
                </div>

                {t.trust && (
                  <div className="mt-2">
                    <TrustBadge trust={t.trust} languageName={getTargetLangConfig(t.languages[0] ?? 'en').name} />
                  </div>
                )}

                {t.sharesLanguage && (
                  <Badge variant="success" className="mt-2">Speaks your language</Badge>
                )}

                {t.instructionLanguages.length > 0 && (
                  <p className="mt-2 text-xs leading-relaxed text-dojo-text-muted">
                    Explains in{' '}
                    {t.instructionLanguages.map((code) => getNativeLangName(code)).join(', ')}
                  </p>
                )}

                {t.bio && (
                  <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-dojo-text-muted">
                    <TranslatedText text={t.bio} />
                  </p>
                )}

                <div className="mt-4 flex items-center justify-between">
                  <span className="text-sm font-semibold text-dojo-text-primary">
                    {formatMoney(t.hourlyRateCents, t.currency, locale)}
                    {t.hourlyRateCents > 0 && (
                      <span className="text-xs font-normal text-dojo-text-muted"> / hr</span>
                    )}
                  </span>
                  <Link
                    href={`/tutors/${t.id}`}
                    className="inline-flex items-center gap-2 rounded-(--radius-md) bg-dojo-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-dojo-accent/90"
                  >
                    <Calendar className="h-4 w-4" /> Book
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
      )}

      {user == null && (
        <p className="mt-6 text-xs text-dojo-text-muted">Sign in to book a session.</p>
      )}
    </div>
  );
}
