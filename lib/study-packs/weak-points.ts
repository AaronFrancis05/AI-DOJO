/**
 * The learner weak-point model (PLAN.md 3.1), as pure functions.
 *
 * A session's `corrections` rows are classified by the model into a category
 * and a short pattern label, then merged into `learner_weak_points`. The model
 * is shown the learner's existing labels and told to reuse them verbatim, which
 * is what lets a count grow across sessions instead of every session minting
 * new near-duplicate labels. `normalizePattern` catches the case and spacing
 * drift that is left.
 *
 * Database access lives in lib/inngest/functions/generateStudyPack.ts; this
 * file only decides what to write.
 */

import { WEAK_POINT_RESOLVE_AFTER } from './config';
import { WEAK_POINT_CATEGORIES, type WeakPointCategory } from './types';

export interface SessionCorrection {
  id: number;
  correctionType: string;
  originalText: string;
  correctedText: string;
  explanation: string;
}

export interface ExistingWeakPoint {
  id: number;
  category: string;
  pattern: string;
  count: number;
  cleanSessionCount: number;
  lastSeenAt: Date;
  resolvedAt: Date | null;
}

/** One classified correction. */
export interface WeakPointHit {
  correctionId: number;
  category: WeakPointCategory;
  pattern: string;
  /** "original → corrected", the instance shown to the learner and the tutor. */
  example: string;
}

/**
 * Maps the free-form `correctionType` the analysis model writes onto the four
 * categories. Same buckets as correctionBucketLabel in
 * lib/roleplay/session-metrics.ts, with cultural and politeness slips as
 * `register`.
 */
export function categoryFromCorrectionType(correctionType: string | null | undefined): WeakPointCategory {
  const type = (correctionType ?? '').toLowerCase();
  if (type.includes('pronunc')) return 'pronunciation';
  if (type.includes('vocab') || type.includes('word')) return 'vocab';
  if (type.includes('polite') || type.includes('cultural') || type.includes('register') || type.includes('formal')) return 'register';
  return 'grammar';
}

function isCategory(value: unknown): value is WeakPointCategory {
  return typeof value === 'string' && (WEAK_POINT_CATEGORIES as readonly string[]).includes(value);
}

/** Lower-cased, single-spaced, without trailing punctuation, at most 120 characters. */
export function normalizePattern(label: string): string {
  return label
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[\s"'“”.,;:!?-]+|[\s"'“”.,;:!?-]+$/g, '')
    .slice(0, 120);
}

export function buildClassifyPrompt(input: {
  targetLanguageName: string;
  corrections: SessionCorrection[];
  existingPatterns: { category: string; pattern: string }[];
}): string {
  const known = input.existingPatterns.length > 0
    ? input.existingPatterns.map((p) => `- [${p.category}] ${p.pattern}`).join('\n')
    : '(none yet)';
  const items = input.corrections
    .map((c) => `- id ${c.id} (${c.correctionType}): "${c.originalText}" -> "${c.correctedText}". ${c.explanation}`)
    .join('\n');

  return `You classify a ${input.targetLanguageName} learner's mistakes into recurring weak points.

For each correction below, choose:
- "category": exactly one of ${WEAK_POINT_CATEGORIES.map((c) => `"${c}"`).join(', ')}. "register" means politeness, formality or tone that does not fit the situation.
- "pattern": a short English label (3 to 8 words) naming the underlying rule, not this one sentence. Good: "past simple of irregular verbs", "articles before singular countable nouns". Bad: "said goed instead of went".

This learner's known weak points are listed below. When a correction is an instance of one of them, return that label EXACTLY as written, so the same weakness is counted together. Only invent a new label for a genuinely different rule.

Known weak points:
${known}

Corrections:
${items}

Return JSON: {"items": [{"id": <correction id>, "category": "...", "pattern": "..."}]} with one entry per correction.`;
}

/**
 * Validates the classifier's answer against the corrections it was given.
 * Unknown ids and empty labels are dropped; an invalid category falls back to
 * the one implied by the correction's own type.
 */
export function parseClassification(raw: string, corrections: SessionCorrection[]): WeakPointHit[] {
  const parsed: unknown = JSON.parse(raw);
  const items = Array.isArray(parsed)
    ? parsed
    : (parsed && typeof parsed === 'object' && Array.isArray((parsed as { items?: unknown }).items))
      ? (parsed as { items: unknown[] }).items
      : [];
  const byId = new Map(corrections.map((c) => [c.id, c]));
  const hits: WeakPointHit[] = [];
  const seen = new Set<number>();

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const { id, category, pattern } = item as { id?: unknown; category?: unknown; pattern?: unknown };
    const correction = byId.get(Number(id));
    if (!correction || seen.has(correction.id)) continue;
    const label = typeof pattern === 'string' ? normalizePattern(pattern) : '';
    if (!label) continue;
    seen.add(correction.id);
    hits.push({
      correctionId: correction.id,
      category: isCategory(category) ? category : categoryFromCorrectionType(correction.correctionType),
      pattern: label,
      example: `${correction.originalText} → ${correction.correctedText}`.slice(0, 500),
    });
  }
  return hits;
}

export const weakPointKey = (category: string, pattern: string) => `${category}::${pattern}`;

export interface WeakPointPlan {
  /** One per distinct (category, pattern) seen this session. */
  upserts: { category: WeakPointCategory; pattern: string; example: string; occurrences: number }[];
  /** Open points not seen this session: their new clean-session count, and whether that resolves them. */
  untouched: { id: number; cleanSessionCount: number; resolve: boolean }[];
}

/**
 * Decides the writes for one completed session. A pattern seen again is
 * reopened (the upsert clears resolvedAt and the clean count); an open pattern
 * not seen moves one session closer to resolved; a resolved one is left alone.
 */
export function planWeakPointUpdates(existing: ExistingWeakPoint[], hits: WeakPointHit[]): WeakPointPlan {
  const grouped = new Map<string, WeakPointPlan['upserts'][number]>();
  for (const hit of hits) {
    const key = weakPointKey(hit.category, hit.pattern);
    const entry = grouped.get(key);
    if (entry) {
      entry.occurrences += 1;
      entry.example = hit.example;
    } else {
      grouped.set(key, { category: hit.category, pattern: hit.pattern, example: hit.example, occurrences: 1 });
    }
  }

  const untouched = existing
    .filter((p) => p.resolvedAt === null && !grouped.has(weakPointKey(p.category, p.pattern)))
    .map((p) => {
      const cleanSessionCount = p.cleanSessionCount + 1;
      return { id: p.id, cleanSessionCount, resolve: cleanSessionCount >= WEAK_POINT_RESOLVE_AFTER };
    });

  return { upserts: [...grouped.values()], untouched };
}

/**
 * The weak points a pack should target: what went wrong in this session
 * first, then the learner's most frequent open patterns.
 */
export function selectFocusWeakPoints<T extends { category: string; pattern: string; count: number; lastSeenAt: Date }>(
  open: T[],
  hitKeys: Set<string>,
  limit: number,
): T[] {
  return [...open]
    .sort((a, b) => {
      const aHit = hitKeys.has(weakPointKey(a.category, a.pattern)) ? 1 : 0;
      const bHit = hitKeys.has(weakPointKey(b.category, b.pattern)) ? 1 : 0;
      if (aHit !== bHit) return bHit - aHit;
      if (a.count !== b.count) return b.count - a.count;
      return b.lastSeenAt.getTime() - a.lastSeenAt.getTime();
    })
    .slice(0, limit);
}
