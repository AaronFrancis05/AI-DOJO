/**
 * Tutor language codes checked against the live catalogue.
 *
 * Kept out of `languages.ts` because `loadLanguageCatalog` pulls in Drizzle,
 * and `src/db` throws when DATABASE_URL is unset. Parse/validate helpers stay
 * database-free so unit tests can import them in CI.
 */
import { loadLanguageCatalog } from '@/lib/language-registry';

/**
 * Which of `codes` are not offered on that side of the configured catalogue.
 * Empty means every code is valid.
 */
export async function unknownLanguageCodes(
  codes: string[],
  side: 'target' | 'native',
): Promise<string[]> {
  const catalog = await loadLanguageCatalog();
  const known = new Set<string>(
    (side === 'target' ? catalog.target : catalog.native).map((l) => l.code),
  );
  return codes.filter((c) => !known.has(c));
}
