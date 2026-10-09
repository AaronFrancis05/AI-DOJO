/* ───────────────────────────────────────────────
   TrustBadge — "Verified C1 English · clarity 92 · 4.8★ (120 lessons)"
   (PLAN.md 4.6). Answers the "native speakers only" bias with evidence: every
   number is a stored vetting result or a count of real reviews and lessons,
   and a part with no data is left out rather than shown as zero.
   ─────────────────────────────────────────────── */

import { ShieldCheck, Star } from 'lucide-react';

export interface TutorTrustBadge {
  cefrLevel: string | null;
  clarityScore: number | null;
  averageRating: number | null;
  reviewCount: number;
  completedLessons: number;
}

export function TrustBadge({ trust, languageName }: { trust: TutorTrustBadge; languageName: string }) {
  const parts: string[] = [];
  if (trust.cefrLevel) parts.push(`Verified ${trust.cefrLevel} ${languageName}`);
  if (trust.clarityScore != null) parts.push(`clarity ${trust.clarityScore}`);
  if (parts.length === 0 && trust.averageRating == null) return null;

  return (
    <p className="flex flex-wrap items-center gap-1 text-xs leading-relaxed text-dojo-text-primary">
      <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-dojo-success" aria-hidden />
      <span>{parts.join(' · ')}</span>
      {trust.averageRating != null && (
        <span className="inline-flex items-center gap-1">
          {parts.length > 0 && '·'} {trust.averageRating}
          <Star className="h-3 w-3 fill-dojo-warning text-dojo-warning" aria-label="stars" />
          ({trust.completedLessons} lessons)
        </span>
      )}
    </p>
  );
}
