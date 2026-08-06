/* ───────────────────────────────────────────────
   Courses — language-driven library of structured
   learning paths, personalized by the learner's
   preferred target language.
   Consumes /api/courses (list + level/lesson counts).
   ─────────────────────────────────────────────── */

'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { usePageTitle } from '@/lib/hooks/PageTitleContext';
import { useUser } from '@/lib/auth/user-context';
import { TARGET_LANGUAGES, getTargetLangConfig } from '@/lib/language';
import {
  GraduationCap,
  ArrowRight,
  Layers,
  BookOpen,
  Sparkles,
  Globe2,
  Search,
} from 'lucide-react';

interface CourseRecord {
  id: number;
  slug: string;
  title: string;
  description: string;
  targetLanguage: string;
  nativeLanguage: string;
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
  const [activeLang, setActiveLang] = useState<string>('all');
  const [langQuery, setLangQuery] = useState('');

  const preferredLang = user?.preferredTargetLanguage ?? '';

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/courses');
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

  const languagesWithCourses = useMemo(() => {
    const codes = new Set(courses.map((c) => c.targetLanguage));
    return TARGET_LANGUAGES.filter((l) => codes.has(l.code));
  }, [courses]);

  const activeFilter = activeLang === 'all'
    ? preferredLang && languagesWithCourses.some((l) => l.code === preferredLang)
      ? preferredLang
      : 'all'
    : activeLang;

  const filtered = useMemo(() => {
    const list = activeFilter === 'all'
      ? courses
      : courses.filter((c) => c.targetLanguage === activeFilter);

    const isRecommended = (c: CourseRecord) =>
      preferredLang !== '' && c.targetLanguage === preferredLang;

    return [...list].sort((a, b) => {
      if (isRecommended(a) !== isRecommended(b)) return isRecommended(a) ? -1 : 1;
      if (a.nativeLanguage === b.nativeLanguage) return a.displayOrder - b.displayOrder;
      return (a.nativeLanguage === user?.nativeLanguage ? -1 : 1);
    });
  }, [courses, activeFilter, preferredLang, user?.nativeLanguage]);

  const preferredCfg = getTargetLangConfig(preferredLang);
  const showPersonalized = preferredLang !== '' && filtered.some((c) => c.targetLanguage === preferredLang);
  const hasPreferredCourses = courses.some((c) => c.targetLanguage === preferredLang);

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-10">
      <div className="mb-8">
        <h1 className="hidden md:block text-3xl font-bold text-dojo-text-primary tracking-tight leading-none">
          Learning Paths
        </h1>
        <p className="mt-2 text-base text-dojo-text-muted leading-relaxed">
          Follow a structured course from your first words to real conversations.
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="animate-pulse !p-8">
              <div className="h-12 w-12 rounded-xl bg-dojo-border mb-4" />
              <div className="h-5 w-3/4 bg-dojo-border rounded mb-3" />
              <div className="h-3 w-full bg-dojo-border rounded mb-2" />
              <div className="h-3 w-2/3 bg-dojo-border rounded mb-6" />
              <div className="h-8 w-28 bg-dojo-border rounded" />
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
        <>
          {showPersonalized && (
            <div className="mb-8 flex items-center gap-4 rounded-2xl border border-dojo-accent/30 bg-dojo-accent/5 p-4 sm:p-6">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-dojo-accent/20 text-dojo-accent">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-dojo-text-primary">
                  Recommended for you — {preferredCfg.name}
                </p>
                <p className="text-sm text-dojo-text-muted leading-relaxed">
                  We&apos;ve surfaced paths in {preferredCfg.nativeName} first, matched to your profile.
                </p>
              </div>
            </div>
          )}

          <div className="mb-6 flex flex-col gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dojo-text-muted" />
              <input
                type="text"
                value={langQuery}
                onChange={(e) => setLangQuery(e.target.value)}
                placeholder="Filter by language..."
                className="w-full rounded-lg border border-dojo-border bg-dojo-surface py-2 pl-9 pr-4 text-sm text-dojo-text-primary outline-none transition placeholder:text-dojo-text-muted/60 focus:border-dojo-accent focus:ring-2 focus:ring-dojo-accent/20"
              />
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-2">
            <button
              type="button"
              onClick={() => setActiveLang('all')}
              className={`flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                activeLang === 'all'
                  ? 'border-dojo-accent bg-dojo-accent text-white'
                  : 'border-dojo-border bg-dojo-surface text-dojo-text-muted hover:border-dojo-accent/50 hover:text-dojo-text-primary'
              }`}
            >
              <Globe2 className="h-4 w-4" />
              All languages
              <span className={`rounded-full px-2 py-0.5 text-[10px] ${
                activeLang === 'all' ? 'bg-white/20 text-white' : 'bg-dojo-surface-raised text-dojo-text-muted'
              }`}>
                {courses.length}
              </span>
            </button>
            {languagesWithCourses
              .filter((lang) => {
                const q = langQuery.trim().toLowerCase();
                if (!q) return true;
                return lang.name.toLowerCase().includes(q) || lang.nativeName.toLowerCase().includes(q);
              })
              .map((lang) => {
              const count = courses.filter((c) => c.targetLanguage === lang.code).length;
              const active = activeLang === lang.code;
              return (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => setActiveLang(lang.code)}
                  className={`flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                    active
                      ? 'border-dojo-accent bg-dojo-accent text-white'
                      : 'border-dojo-border bg-dojo-surface text-dojo-text-muted hover:border-dojo-accent/50 hover:text-dojo-text-primary'
                  }`}
                >
                  <span className="text-sm leading-none">{lang.flag}</span>
                  {lang.nativeName}
                  <span className={`rounded-full px-2 py-0.5 text-[10px] ${
                    active ? 'bg-white/20 text-white' : 'bg-dojo-surface-raised text-dojo-text-muted'
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
            </div>
          </div>

          {filtered.length === 0 ? (
            <Card className="text-center py-16 border-dashed border-dojo-border/60">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-dojo-surface-raised mb-4">
                <BookOpen className="h-8 w-8 text-dojo-border" />
              </div>
              <p className="text-dojo-text-primary font-bold mb-1">
                {hasPreferredCourses ? 'No paths in this language yet' : 'No structured path yet'}
              </p>
              <p className="text-sm text-dojo-text-muted max-w-sm mx-auto leading-relaxed">
                The curriculum for {activeLang === 'all' ? 'this language' : getTargetLangConfig(activeLang).name}
                is being built. Meanwhile, jump into free scenarios in the Hub.
              </p>
              <div className="mt-6">
                <Link href="/hub" className="inline-flex items-center gap-2 rounded-lg bg-dojo-accent px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90">
                  Explore the Hub
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {filtered.map((course) => {
                const recommended = preferredLang !== '' && course.targetLanguage === preferredLang;
                return (
                  <Link key={course.id} href={`/courses/${course.slug}`} className="block">
                    <Card hoverable className="group h-full !p-8 relative overflow-hidden border-dojo-border hover:border-dojo-accent transition-all duration-300">
                      <div className="absolute -top-16 -right-16 h-40 w-40 rounded-full bg-dojo-accent/10 blur-[60px] transition-opacity duration-300 group-hover:opacity-100 opacity-0" />
                      <div className="relative">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-dojo-accent/20 text-dojo-accent mb-5">
                          <GraduationCap className="h-6 w-6" />
                        </div>

                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant={course.difficulty as 'beginner'}>
                            {DIFFICULTY_LABEL[course.difficulty] ?? course.difficulty}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {getTargetLangConfig(course.targetLanguage).nativeName}
                          </Badge>
                          {recommended && (
                            <Badge variant="outline" className="text-[10px] text-dojo-accent border-dojo-accent/40">
                              <Sparkles className="h-3 w-3" />
                              Recommended
                            </Badge>
                          )}
                        </div>

                        <h3 className="text-lg font-bold text-dojo-text-primary leading-snug mb-2">
                          {course.title}
                        </h3>
                        <p className="text-sm text-dojo-text-muted leading-relaxed mb-6 line-clamp-3">
                          {course.description}
                        </p>

                        <div className="flex items-center gap-4 pt-4 border-t border-dojo-border/60">
                          <span className="flex items-center gap-1.5 text-xs font-semibold text-dojo-text-muted">
                            <Layers className="h-3.5 w-3.5 text-dojo-accent" />
                            {course.levelCount} levels
                          </span>
                          <span className="flex items-center gap-1.5 text-xs font-semibold text-dojo-text-muted">
                            <BookOpen className="h-3.5 w-3.5 text-dojo-accent" />
                            {course.lessonCount} lessons
                          </span>
                          <ArrowRight className="ml-auto h-4 w-4 text-dojo-text-muted transition-transform duration-300 group-hover:translate-x-1 group-hover:text-dojo-accent" />
                        </div>
                      </div>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </>
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
