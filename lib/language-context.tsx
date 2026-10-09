'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  NATIVE_LANGUAGES,
  TARGET_LANGUAGES,
  hydrateLanguageCatalog,
  type LanguageConfig,
  type NativeLanguage,
} from '@/lib/language';
import { createTranslator, type MessageTree, type Translate } from '@/lib/i18n/messages';
import type { UiLocaleSource } from '@/lib/i18n/config';
import english from '@/messages/en.json';

export interface LanguageCatalogValue {
  /** Languages a learner may study — `languages.is_target_enabled`. */
  target: LanguageConfig[];
  /** Languages the app may explain in — `languages.is_native_enabled`. */
  native: NativeLanguage[];
}

/**
 * The language the interface itself is shown in, resolved on the server by
 * lib/i18n/server.ts (loadUiLocaleContext). Carried by the same provider as
 * the catalogue — one language provider, not two.
 */
export interface UiLocaleValue {
  locale: string;
  dir: 'ltr' | 'rtl';
  source: UiLocaleSource;
  /** Already merged over English, so every key resolves. */
  messages: MessageTree;
}

const UiLocaleContext = createContext<UiLocaleValue | null>(null);

const ENGLISH_UI: UiLocaleValue = {
  locale: 'en',
  dir: 'ltr',
  source: 'default',
  messages: english as MessageTree,
};

const LanguageCatalogContext = createContext<LanguageCatalogValue | null>(null);

/**
 * Carries the admin-configured catalogue into client components.
 *
 * Two jobs, and both are needed:
 *
 * 1. It hydrates `lib/language.ts`'s live arrays in the browser, so the
 *    synchronous lookups there (`getTargetLangConfig`, `getAzureVoice`, …)
 *    answer for an admin-added language on the client as well as the server.
 * 2. It puts the same data in context, because step 1 is a mutation and a
 *    mutation does not re-render. Anything that *lists* languages reads this
 *    hook; anything that *looks one up by code* can keep calling the helper.
 *
 * Mounted from a server parent that already resolved the catalogue, so there is
 * no fetch and no loading state.
 */
export function LanguageCatalogProvider({
  value,
  ui,
  children,
}: {
  value: LanguageCatalogValue;
  /** The UI locale. Omitted, the interface is English. */
  ui?: UiLocaleValue;
  children: ReactNode;
}) {
  // During render, not in an effect: a child rendering in this same pass may
  // call getTargetLangConfig(), and an effect would run after it. Splicing the
  // same contents repeatedly is idempotent, so re-renders are harmless.
  hydrateLanguageCatalog(value.target, value.native);

  const catalog = useMemo(() => value, [value]);
  const uiValue = useMemo(() => ui ?? ENGLISH_UI, [ui]);

  return (
    <LanguageCatalogContext.Provider value={catalog}>
      <UiLocaleContext.Provider value={uiValue}>
        {children}
      </UiLocaleContext.Provider>
    </LanguageCatalogContext.Provider>
  );
}

/**
 * The catalogue to render pickers from.
 *
 * Falls back to the compiled-in arrays when no provider is above it, so a
 * surface that has not been wired up yet still lists something sensible rather
 * than rendering an empty select.
 */
export function useLanguageCatalog(): LanguageCatalogValue {
  const ctx = useContext(LanguageCatalogContext);
  const fallback = useMemo(
    () => ({ target: TARGET_LANGUAGES, native: NATIVE_LANGUAGES }),
    [],
  );
  return ctx ?? fallback;
}

/** The active UI locale — for Intl formatting (lib/i18n/format.ts) and the switcher. */
export function useUiLocale(): Omit<UiLocaleValue, 'messages'> {
  const ctx = useContext(UiLocaleContext) ?? ENGLISH_UI;
  return { locale: ctx.locale, dir: ctx.dir, source: ctx.source };
}

/**
 * `t()` for client components: `t('nav.home')`, `t('sidebar.level', { level })`.
 * Outside a provider it answers in English, so an unwired surface still reads.
 */
export function useT(): Translate {
  const messages = (useContext(UiLocaleContext) ?? ENGLISH_UI).messages;
  return useMemo(() => createTranslator(messages), [messages]);
}
