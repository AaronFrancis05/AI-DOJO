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

import { Avatar } from '@/components/ui/Avatar';
import { usePageTitle } from '@/lib/hooks/PageTitleContext';
import { useUser } from '@/lib/auth/user-context';
import { TUTORS_ENABLED } from '@/lib/tutors/config';
import { getTargetLangConfig } from '@/lib/language';
import { Video, Calendar, ArrowRight, GraduationCap } from 'lucide-react';

interface TutorRow {
  id: number;
  name: string;
  headline: string;
  bio: string | null;
  languages: string[];
  hourlyRateCents: number;
  currency: string;
  timezone: string;
  avatarSrc: string | null;
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

function formatMoney(cents: number, currency: string): string {
  if (cents === 0) return 'Free';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

const STATUS_VARIANT: Record<string, 'accent' | 'success' | 'default' | 'outline'> = {
  requested: 'outline',
  confirmed: 'accent',
  completed: 'success',
  cancelled: 'default',
};

export default function TutorsPage() {
  usePageTitle('Tutors');
  const router = useRouter();
  const user = useUser();
  const [tutors, setTutors] = useState<TutorRow[]>([]);
  const [upcoming, setUpcoming] = useState<BookingRow[]>([]);
  // Starts false when the feature is off, so the disabled path never has to
  // call setState from inside an effect just to stop a spinner.
  const [loading, setLoading] = useState(TUTORS_ENABLED);

  useEffect(() => {
    if (!TUTORS_ENABLED) return;
    Promise.all([
      fetch('/api/tutors', { credentials: 'include' }).then((r) => r.json()).catch(() => ({})),
      fetch('/api/bookings', { credentials: 'include' }).then((r) => r.json()).catch(() => ({})),
    ]).then(([t, b]) => {
      if (Array.isArray(t.tutors)) setTutors(t.tutors);
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

  // Ships dark until a LiveKit server is deployed. Showing a booking flow
  // that cannot connect would be worse than showing nothing.
  if (!TUTORS_ENABLED) {
    return (
      <div className="mx-auto w-full max-w-2xl p-6">
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
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl p-6">
      <h1 className="mb-8 hidden text-2xl font-bold tracking-tight text-dojo-text-primary md:block">
        Tutors
      </h1>

      {upcoming.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-dojo-text-muted">
            Upcoming sessions
          </h2>
          <div className="space-y-3">
            {upcoming.map((b) => (
              <Card key={b.id} hoverable className="!p-4 cursor-pointer" onClick={() => router.push(`/live/${b.id}`)}>
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
                      {formatWhen(b.scheduledAt)} · {b.durationMinutes} min
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

      <section>
        <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-dojo-text-muted">
          Available tutors
        </h2>

        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[0, 1].map((i) => (
              <Card key={i} className="animate-pulse !p-5">
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
            {tutors.map((t) => (
              <Card key={t.id} hoverable className="!p-5">
                <div className="flex items-start gap-3">
                  <Avatar src={t.avatarSrc ?? undefined} name={t.name} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-dojo-text-primary">{t.name}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-dojo-text-muted">{t.headline}</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {t.languages.map((code) => (
                    <Badge key={code} variant="outline">
                      {getTargetLangConfig(code).name}
                    </Badge>
                  ))}
                </div>

                {t.bio && (
                  <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-dojo-text-muted">{t.bio}</p>
                )}

                <div className="mt-4 flex items-center justify-between">
                  <span className="text-sm font-semibold text-dojo-text-primary">
                    {formatMoney(t.hourlyRateCents, t.currency)}
                    {t.hourlyRateCents > 0 && (
                      <span className="text-xs font-normal text-dojo-text-muted"> / hr</span>
                    )}
                  </span>
                  <Link
                    href={`/tutors/${t.id}`}
                    className="inline-flex items-center gap-2 rounded-[--radius-md] bg-dojo-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-dojo-accent/90"
                  >
                    <Calendar className="h-4 w-4" /> Book
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {user == null && (
        <p className="mt-6 text-xs text-dojo-text-muted">Sign in to book a session.</p>
      )}
    </div>
  );
}
