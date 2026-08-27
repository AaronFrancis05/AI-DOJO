/**
 * The runtime language catalogue — the `languages` table read through the cache,
 * with `lib/language.ts`'s compiled-in arrays as the fallback.
 *
 * Server-only: it imports the Drizzle client. Client components get the same
 * data from `LanguageCatalogProvider`, which is handed it by a server parent.
 *
 * Why a table at all: an admin has to be able to add a language, and a language
 * is not just a name — without the BCP47 tags and the Azure voice ids nothing
 * can be spoken or transcribed in it. Why the constants survive: they are the
 * seed, and they are what keeps the app running when the table is empty or the
 * database is unreachable.
 */
import { asc } from 'drizzle-orm';
import { db } from '@/src/db';
import { languages } from '@/src/schema';
import { cacheGet, cacheSet, cacheDel, cacheKeys, TTL } from '@/lib/cache';
import {
  BUILT_IN_NATIVE_LANGUAGES,
  BUILT_IN_TARGET_LANGUAGES,
  hydrateLanguageCatalog,
  type GreetingGesture,
  type LanguageConfig,
  type NativeLanguage,
} from '@/lib/language';

export interface LanguageCatalog {
  target: LanguageConfig[];
  native: NativeLanguage[];
}

type LanguageRow = typeof languages.$inferSelect;

/** A `languages` row in the shape the rest of the app already speaks. */
export function rowToConfig(row: LanguageRow): LanguageConfig {
  return {
    code: row.code,
    name: row.name,
    nativeName: row.nativeName,
    flag: row.flag,
    bcp47: { stt: row.sttBcp47, tts: row.ttsBcp47 },
    azureVoice: { female: row.azureVoiceFemale, male: row.azureVoiceMale },
    hasPhonetic: row.hasPhonetic,
    ttsSupported: row.ttsSupported,
    // Undefined rather than null: getGreetingGesture() reads `?? 'wave'`, and
    // the optional field is what the built-in configs use for the same meaning.
    greetingGesture: (row.greetingGesture as GreetingGesture | null) ?? undefined,
  };
}

const FALLBACK: LanguageCatalog = {
  target: BUILT_IN_TARGET_LANGUAGES.map((l) => ({ ...l })),
  native: BUILT_IN_NATIVE_LANGUAGES.map((l) => ({ ...l })),
};

/**
 * The catalogue as configured, hydrated into `lib/language.ts` as a side effect
 * so the synchronous lookups there answer for admin-added languages too.
 *
 * Never throws. A language catalogue that fails is not a recoverable state for
 * any caller — every prompt and every voice depends on one — so an unreadable
 * table degrades to the built-in set rather than to an error.
 */
export async function loadLanguageCatalog(): Promise<LanguageCatalog> {
  const cached = await cacheGet<LanguageCatalog>(cacheKeys.languageCatalog());
  if (cached && cached.target.length > 0 && cached.native.length > 0) {
    hydrateLanguageCatalog(cached.target, cached.native);
    return cached;
  }

  let rows: LanguageRow[];
  try {
    rows = await db.select().from(languages).orderBy(asc(languages.displayOrder), asc(languages.name));
  } catch {
    // Unseeded or unreachable. Not cached — the next call should try again
    // rather than pin the fallback for an hour.
    hydrateLanguageCatalog(FALLBACK.target, FALLBACK.native);
    return FALLBACK;
  }

  if (rows.length === 0) {
    hydrateLanguageCatalog(FALLBACK.target, FALLBACK.native);
    return FALLBACK;
  }

  const catalog: LanguageCatalog = {
    target: rows.filter((r) => r.isTargetEnabled).map(rowToConfig),
    native: rows
      .filter((r) => r.isNativeEnabled)
      .map((r) => ({ code: r.code, name: r.name, nativeName: r.nativeName })),
  };

  // An admin who disables every target language would otherwise black out the
  // whole app. Treat it as a misconfiguration and keep serving the built-ins.
  //
  // The native side is not optional either: onboarding's "what do you speak"
  // step, the tryout panel and every tutor's explanation languages all read it,
  // and an empty list leaves each of them with nothing to pick.
  if (catalog.target.length === 0 || catalog.native.length === 0) {
    hydrateLanguageCatalog(FALLBACK.target, FALLBACK.native);
    return FALLBACK;
  }

  await cacheSet(cacheKeys.languageCatalog(), catalog, TTL.LANGUAGE_CATALOG);
  hydrateLanguageCatalog(catalog.target, catalog.native);
  return catalog;
}

/** Called by every admin write to `languages`, so the next read is fresh. */
export async function invalidateLanguageCatalog(): Promise<void> {
  await cacheDel(cacheKeys.languageCatalog());
}

/**
 * Whether `code` is offered on the given side of the pair. Used to validate
 * anything a user picks — a tutor's teaching languages, a class's instruction
 * language — against what is actually configured, rather than against a
 * hardcoded list that would drift from the admin's choices.
 */
export async function isLanguageEnabled(code: string, side: 'target' | 'native'): Promise<boolean> {
  const catalog = await loadLanguageCatalog();
  const list: { code: string }[] = side === 'target' ? catalog.target : catalog.native;
  return list.some((l) => l.code === code);
}
