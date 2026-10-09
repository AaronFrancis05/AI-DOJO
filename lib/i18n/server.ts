import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db } from '@/src/db';
import { countries, users } from '@/src/schema';
import { getAuthUserReadOnly } from '@/lib/auth/server';
import { cacheGet, cacheKeys, cacheSet, TTL } from '@/lib/cache';
import { NATIVE_LANGUAGES } from '@/lib/language';
import { loadLanguageCatalog } from '@/lib/language-registry';
import {
  DEFAULT_UI_LOCALE,
  UI_LOCALE_COOKIE,
  countryFromHeaders,
  resolveUiLocale,
  type ResolvedUiLocale,
} from './config';
import { createTranslator, mergeMessages, type MessageTree, type Translate } from './messages';
import english from '@/messages/en.json';

/** What a server layout hands LanguageCatalogProvider for the client. */
export interface UiLocaleContext extends ResolvedUiLocale {
  /** The locale's catalog merged over English — complete, so the client needs no fallback. */
  messages: MessageTree;
}

async function profileNativeLanguage(): Promise<string | null> {
  const authUser = await getAuthUserReadOnly();
  if (!authUser) return null;
  const k = cacheKeys.uiNativeLanguage(authUser.id);
  const cached = await cacheGet<string>(k);
  if (cached) return cached;
  const [row] = await db
    .select({ nativeLanguage: users.nativeLanguage })
    .from(users)
    .where(eq(users.id, authUser.id))
    .limit(1);
  if (row?.nativeLanguage) await cacheSet(k, row.nativeLanguage, TTL.USER_PROFILE);
  return row?.nativeLanguage ?? null;
}

async function countryLanguage(countryCode: string | null): Promise<string | null> {
  if (!countryCode) return null;
  const k = cacheKeys.countryLanguage(countryCode);
  const cached = await cacheGet<string>(k);
  if (cached) return cached;
  const [row] = await db
    .select({ language: countries.defaultNativeLanguage })
    .from(countries)
    .where(eq(countries.code, countryCode))
    .limit(1);
  if (row?.language) await cacheSet(k, row.language, TTL.COUNTRY_LANGUAGE);
  return row?.language ?? null;
}

/**
 * The active UI locale for this request. Per-request cached, so the root
 * layout (for `<html lang dir>`) and a section layout (for the messages) share
 * one resolution. A failed lookup degrades to the next source, never throws.
 */
export const getUiLocale = cache(async (): Promise<ResolvedUiLocale> => {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  await loadLanguageCatalog().catch(() => null);
  const [profileNative, geoLanguage] = await Promise.all([
    profileNativeLanguage().catch(() => null),
    countryLanguage(countryFromHeaders((name) => headerStore.get(name))).catch(() => null),
  ]);
  return resolveUiLocale({
    cookie: cookieStore.get(UI_LOCALE_COOKIE)?.value,
    profileNative,
    countryLanguage: geoLanguage,
    acceptLanguage: headerStore.get('accept-language'),
    supported: NATIVE_LANGUAGES.map((l) => l.code),
  });
});

/**
 * The catalog for a locale, merged over English. Catalogs are bundled JSON;
 * a locale with no file yet is simply English.
 */
export const getUiMessages = cache(async (locale: string): Promise<MessageTree> => {
  const base = english as MessageTree;
  if (locale === DEFAULT_UI_LOCALE) return base;
  try {
    const mod = (await import(`@/messages/${locale}.json`)) as { default: MessageTree };
    return mergeMessages(base, mod.default);
  } catch {
    return base;
  }
});

export async function loadUiLocaleContext(): Promise<UiLocaleContext> {
  const resolved = await getUiLocale();
  return { ...resolved, messages: await getUiMessages(resolved.locale) };
}

/** `t()` for server components and route handlers. */
export async function getTranslations(): Promise<Translate> {
  const { locale } = await getUiLocale();
  return createTranslator(await getUiMessages(locale));
}
