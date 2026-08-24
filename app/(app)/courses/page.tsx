/* ───────────────────────────────────────────────
   Courses — one card per language-neutral course
   template. The learner picks the target + native
   language on the card; starting the path carries
   that pair via ?target=&native= query params.
   Consumes /api/courses (template + counts).
   ─────────────────────────────────────────────── */

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { usePageTitle } from '@/lib/hooks/PageTitleContext';
import { useUser } from '@/lib/auth/user-context';
import { LanguagePicker } from '@/components/ui/LanguagePicker';
import {
  GraduationCap,
  ArrowRight,
  Layers,
  BookOpen,
  Sparkles,
} from 'lucide-react';

interface CourseRecord {
  id: number;
  slug: string;
  title: string;
  description: string;
  difficulty: string;
  icon: string | null;
  isActive: boolean;
  displayOrder: number;
  levelCount: number;
  lessonCount: number;
}

const DIFFICULTY_LABEL: Record<string, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

export default function CoursesPage() {
  usePageTitle('Learning Paths');
  const user = useUser();
  const [courses, setCourses] = useState<CourseRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Per-course language pair (pre-filled from profile, editable on the card).
  const [pair, setPair] = useState<Record<number, { target: string; native: string }>>({});

  const preferredTarget = user?.preferredTargetLanguage ?? 'ja';
  const preferredNative = user?.nativeLanguage ?? 'en';

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/courses');
        // A failed route handler can return an empty body — parsing it blindly
        // throws "Unexpected end of JSON input" and hides the real status.
        if (!res.ok) throw new Error(`/api/courses returned ${res.status}`);
        const data = await res.json();
        if (data.success && Array.isArray(data.courses)) {
          if (!cancelled) setCourses(data.courses);
        }
      } catch (e) {
        console.error('Failed to load courses:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const getPair = (id: number) => {
    const existing = pair[id];
    if (existing) return existing;
    return { target: preferredTarget, native: preferredNative };
  };

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-10">
      <div className="mb-8">
        <h1 className="hidden md:block text-3xl font-bold text-dojo-text-primary tracking-tight leading-none">
          Learning Paths
        </h1>
        <p className="mt-2 text-base text-dojo-text-muted leading-relaxed">
          Pick a course, choose your languages, and follow a structured path from
          your first words to real conversations.
        </p>
      </div>

      <div className="mb-8 flex items-center gap-3 rounded-2xl border border-dojo-accent/30 bg-dojo-accent/5 p-4 sm:p-6">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-dojo-accent/20 text-dojo-accent">
          <Sparkles className="h-5 w-5" />
        </div>
        <p className="text-sm text-dojo-text-primary leading-relaxed">
          Courses are language templates — choose the language you want to learn
          and your native language, and the content adapts for you.
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i} className="animate-pulse !p-8">
              <div className="h-12 w-12 rounded-xl bg-dojo-border mb-4" />
              <div className="h-5 w-3/4 bg-dojo-border rounded mb-3" />
              <div className="h-3 w-full bg-dojo-border rounded mb-2" />
              <div className="h-8 w-full bg-dojo-border rounded mt-8" />
            </Card>
          ))}
        </div>
      ) : courses.length === 0 ? (
        <Card className="text-center py-16 border-dashed border-dojo-border/60">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-dojo-surface-raised mb-4">
            <GraduationCap className="h-8 w-8 text-dojo-border" />
          </div>
          <p className="text-dojo-text-primary font-bold mb-1">No courses yet</p>
          <p className="text-sm text-dojo-text-muted max-w-xs mx-auto">
            Structured learning paths will appear here once published.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {courses.map((course) => {
            const p = getPair(course.id);
            return (
              <Card key={course.id} className="group h-full !p-8 relative overflow-hidden border-dojo-border">
                <div className="absolute -top-16 -right-16 h-40 w-40 rounded-full bg-dojo-accent/10 blur-[60px]" />
                <div className="relative">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant={course.difficulty as 'beginner'}>
                      {DIFFICULTY_LABEL[course.difficulty] ?? course.difficulty}
                    </Badge>
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-dojo-text-muted">
                      <Layers className="h-3.5 w-3.5 text-dojo-accent" />
                      {course.levelCount} levels
                    </span>
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-dojo-text-muted">
                      <BookOpen className="h-3.5 w-3.5 text-dojo-accent" />
                      {course.lessonCount} lessons
                    </span>
                  </div>

                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-dojo-accent/20 text-dojo-accent mb-4 mt-2">
                    <GraduationCap className="h-6 w-6" />
                  </div>

                  <h2 className="text-lg font-bold text-dojo-text-primary leading-snug mb-2">
                    {course.title}
                  </h2>
                  <p className="text-sm text-dojo-text-muted leading-relaxed mb-6 line-clamp-3">
                    {course.description}
                  </p>

                  <div className="rounded-2xl border border-dojo-border bg-dojo-surface/60 p-5 mb-6">
                    <LanguagePicker
                      targetLanguage={p.target}
                      nativeLanguage={p.native}
                      onTargetChange={(target) =>
                        setPair((prev) => ({ ...prev, [course.id]: { ...getPair(course.id), target } }))
                      }
                      onNativeChange={(native) =>
                        setPair((prev) => ({ ...prev, [course.id]: { ...getPair(course.id), native } }))
                      }
                    />
                  </div>

                  <Link
                    href={`/courses/${course.slug}?target=${p.target}&native=${p.native}`}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-dojo-accent px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                  >
                    Start this course
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <div className="mt-10 flex items-center gap-2 text-sm text-dojo-text-muted">
        <Sparkles className="h-4 w-4 text-dojo-warning" />
        Prefer freeform practice? Visit the
        <Link href="/hub" className="font-semibold text-dojo-accent hover:underline">
          Hub
        </Link>
        to jump into any scenario directly.
      </div>
    </div>
  );
}