import { NextRequest } from 'next/server';
import { getAuthUser } from '@/lib/auth/server';
import { cacheKeys, rateLimitIncrement } from '@/lib/cache';
import { isLanguageEnabled } from '@/lib/language-registry';
import { MAX_DYNAMIC_TEXT_CHARS, translateForUi } from '@/lib/i18n/translate-dynamic';

const MAX_TEXTS_PER_REQUEST = 20;
// Cached translations cost nothing, so this only bounds a client that keeps
// asking for new text. A tutor list page is ~20 bios.
const MAX_REQUESTS_PER_WINDOW = 120;
const RATE_WINDOW_SECONDS = 600;

/**
 * POST { texts: string[], lang } → { translations: string[] }, same order.
 *
 * Signed-in only: each uncached text is a billed call. A failed translation
 * comes back as the original text, never an error, so the UI can always
 * render something.
 */
export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null) as { texts?: unknown; lang?: unknown } | null;
  const lang = typeof body?.lang === 'string' ? body.lang : '';
  const texts = Array.isArray(body?.texts) ? body.texts : null;
  if (!lang || !texts || texts.length === 0 || texts.length > MAX_TEXTS_PER_REQUEST
    || !texts.every((t) => typeof t === 'string' && t.length <= MAX_DYNAMIC_TEXT_CHARS)) {
    return Response.json({ error: `Send 1-${MAX_TEXTS_PER_REQUEST} texts of up to ${MAX_DYNAMIC_TEXT_CHARS} characters` }, { status: 400 });
  }
  if (!(await isLanguageEnabled(lang, 'native'))) {
    return Response.json({ error: 'Unknown language' }, { status: 400 });
  }

  // Signed-in, so a cache outage fails open (as chat/stream does).
  const count = await rateLimitIncrement(cacheKeys.translateTextRateLimit(user.id), RATE_WINDOW_SECONDS);
  if (count !== null && count > MAX_REQUESTS_PER_WINDOW) {
    return Response.json({ error: 'Too many translation requests. Please wait a moment.' }, { status: 429 });
  }

  const translations = await Promise.all((texts as string[]).map((t) => translateForUi(t, lang)));
  return Response.json({ translations });
}
