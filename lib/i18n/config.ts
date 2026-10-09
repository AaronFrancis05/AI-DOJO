/**
 * UI-locale resolution: which language the app's own chrome (buttons, labels,
 * headings) is shown in. Separate from the learning pair — a Japanese speaker
 * learning English reads a Japanese UI, and the English being taught is never
 * translated (see `translate="no"` on target-language spans).
 *
 * Pure: no cookies(), headers() or database here, so it is unit tested.
 * lib/i18n/server.ts gathers the inputs.
 */
import { isRtlLanguage, matchAcceptLanguage } from '../language';

/** Set only by the language switcher — an explicit choice, never a guess. */
export const UI_LOCALE_COOKIE = 'ui-locale';
export const DEFAULT_UI_LOCALE = 'en';
/** One year — a language choice should outlive a session. */
export const UI_LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Where the locale came from. Only 'country' and 'browser' are guesses, and
 * only a guess shows the "Viewing in 日本語 · change" notice.
 */
export type UiLocaleSource = 'cookie' | 'profile' | 'country' | 'browser' | 'default';

export interface UiLocaleInputs {
  /** The `ui-locale` cookie. */
  cookie: string | null | undefined;
  /** The signed-in user's `users.nativeLanguage`, when there is one. */
  profileNative: string | null | undefined;
  /** `countries.defaultNativeLanguage` for the visitor's country header. */
  countryLanguage: string | null | undefined;
  acceptLanguage: string | null | undefined;
  /** Enabled native languages — the locales a UI can be shown in. */
  supported: readonly string[];
}

export interface ResolvedUiLocale {
  locale: string;
  source: UiLocaleSource;
  dir: 'ltr' | 'rtl';
}

/**
 * Order: an explicit switcher choice → the signed-in user's native language
 * → the visitor's country (with the browser deciding where they disagree)
 * → English.
 *
 * The cookie outranks the profile on purpose: a Japanese speaker who picks an
 * English UI in the switcher must get it, and the switcher is the only thing
 * that writes the cookie.
 *
 * Country vs browser: a browser set to a non-English language is the clearer
 * reading preference (a French-speaking Swiss visitor, a Hindi browser in
 * India), so it wins; an English browser defers to the country, because
 * English is often just the device default.
 */
export function resolveUiLocale(inputs: UiLocaleInputs): ResolvedUiLocale {
  const supported = new Set(inputs.supported);
  const pick = (code: string | null | undefined): string | null =>
    code && supported.has(code) ? code : null;
  const done = (locale: string, source: UiLocaleSource): ResolvedUiLocale =>
    ({ locale, source, dir: isRtlLanguage(locale) ? 'rtl' : 'ltr' });

  const cookie = pick(inputs.cookie);
  if (cookie) return done(cookie, 'cookie');

  const profile = pick(inputs.profileNative);
  if (profile) return done(profile, 'profile');

  const browser = matchAcceptLanguage(inputs.acceptLanguage, inputs.supported);
  const country = pick(inputs.countryLanguage);
  if (browser && browser !== DEFAULT_UI_LOCALE) return done(browser, 'browser');
  if (country) return done(country, 'country');
  if (browser) return done(browser, 'browser');

  return done(DEFAULT_UI_LOCALE, 'default');
}

/** The request headers hosting platforms put the visitor's ISO country in. */
export const COUNTRY_HEADERS = [
  'cf-ipcountry',           // Cloudflare
  'x-vercel-ip-country',    // Vercel
  'x-country-code',         // nginx GeoIP in front of the Docker deploy
] as const;

export function countryFromHeaders(get: (name: string) => string | null): string | null {
  for (const name of COUNTRY_HEADERS) {
    const value = get(name)?.trim().toUpperCase();
    // XX / T1 are Cloudflare's "unknown" and "Tor" markers.
    if (value && /^[A-Z]{2}$/.test(value) && value !== 'XX' && value !== 'T1') return value;
  }
  return null;
}
