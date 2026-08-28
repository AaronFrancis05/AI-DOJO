import type { NextLessonTarget } from '@/lib/hooks/useRoleplaySession';

/**
 * Where the "Continue" button on a completion screen goes.
 *
 * Kept pure and separate from lesson-progress.ts, which imports the database
 * client and so cannot be pulled into a client component. Every session view
 * calls this rather than routing itself, because all three used to hardcode
 * `/home` — a learner who finished a curriculum lesson was dropped on the
 * dashboard with no route back to the lesson they had just unlocked.
 */
export function continueHref(
  nextLesson: NextLessonTarget | null,
  languages: { targetLanguage?: string | null; nativeLanguage?: string | null },
): string {
  // Free practice has no course to return to.
  if (!nextLesson) return '/home';

  const params = new URLSearchParams();
  if (languages.targetLanguage) params.set('target', languages.targetLanguage);
  if (languages.nativeLanguage) params.set('native', languages.nativeLanguage);
  const query = params.toString() ? `?${params.toString()}` : '';

  // Finishing a unit is worth landing on: the course page anchors on the unit
  // so the learner sees it complete rather than scrolling past it.
  const anchor = nextLesson.unitCompleted
    ? `#unit-${nextLesson.unitId}`
    : nextLesson.nextLessonId
      ? `#lesson-${nextLesson.nextLessonId}`
      : '';

  return `/courses/${nextLesson.courseSlug}${query}${anchor}`;
}
