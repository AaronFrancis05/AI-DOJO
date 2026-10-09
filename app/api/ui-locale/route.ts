import { NextRequest, NextResponse } from 'next/server';
import { UI_LOCALE_COOKIE, UI_LOCALE_COOKIE_MAX_AGE } from '@/lib/i18n/config';
import { isLanguageEnabled } from '@/lib/language-registry';

/**
 * Stores the interface language the visitor picked in the switcher.
 *
 * Public on purpose: a logged-out visitor on the marketing site needs it as
 * much as a learner does. It only ever sets a cookie on the caller's own
 * browser, and only to an enabled native language, so there is nothing to
 * protect. Signed-in or not, this explicit choice outranks every guess
 * (lib/i18n/config.ts resolveUiLocale).
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { locale?: unknown } | null;
  const locale = typeof body?.locale === 'string' ? body.locale.trim() : '';
  if (!locale || !(await isLanguageEnabled(locale, 'native'))) {
    return NextResponse.json({ error: 'Unknown language' }, { status: 400 });
  }

  const res = NextResponse.json({ success: true, locale });
  res.cookies.set(UI_LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: UI_LOCALE_COOKIE_MAX_AGE,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
  return res;
}
