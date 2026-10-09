import type { NextLessonTarget } from '@/lib/roleplay/api-types';

/**
 * Where the "Continue" / "Next Lesson" button on a completion screen goes.
 *
 * Kept pure and separate from lesson-progress.ts, which imports the database
 * client and so cannot be pulled into a client component. Every session view
 * calls this rather than routing itself.
 */
export function continueHref(
  nextLesson: NextLessonTarget | null,
  languages: { targetLanguage?: string | null; nativeLanguage?: string | null },
): string {
  // Free practice has no course to return to — Library is where the next
  // scenario is chosen.
  if (!nextLesson) return '/library';

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
