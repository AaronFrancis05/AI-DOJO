/**
 * The personalization fields on `users` (PLAN.md 3.4): `occupation` and
 * `interests`. Interests are stored as a JSON array in a text column; these
 * helpers are the only place that format is read or written.
 */

export const MAX_INTERESTS = 8;
const MAX_INTEREST_LENGTH = 40;
export const MAX_OCCUPATION_LENGTH = 80;

/**
 * Interests a learner can pick in onboarding with one tap. Free text is
 * accepted too; these only make the common answers fast.
 */
export const INTEREST_OPTIONS = [
  'Travel', 'Food', 'Sports', 'Music', 'Movies', 'Technology',
  'Business', 'Health', 'Fashion', 'Gaming', 'Nature', 'Books',
] as const;

/** Trimmed, deduplicated (case-insensitively), capped. Non-strings are dropped. */
export function sanitizeInterests(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const text = item.replace(/\s+/g, ' ').trim().slice(0, MAX_INTEREST_LENGTH);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= MAX_INTERESTS) break;
  }
  return out;
}

export function sanitizeOccupation(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim().slice(0, MAX_OCCUPATION_LENGTH);
  return text || null;
}

/** Reads `users.interests`. A missing or malformed value is no interests. */
export function parseInterests(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    return sanitizeInterests(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function serializeInterests(interests: string[]): string | null {
  const clean = sanitizeInterests(interests);
  return clean.length > 0 ? JSON.stringify(clean) : null;
}
