import { createHash } from 'node:crypto';
import { cacheGet, cacheKeys, cacheSet, TTL } from '@/lib/cache';
import { getAIProvider } from '@/lib/ai-providers';
import { getNativeLangName } from '@/lib/language';
import { isUgaJapaConfigured, translateTextSafe } from '@/lib/ugajapa';

/**
 * Translation of text that is not in the message catalogs — tutor bios,
 * live-lesson titles and descriptions, announcements, organization messages —
 * into a UI locale, on first view.
 *
 * UgaJapa first (it already translates chat), the AI provider when UgaJapa is
 * not configured or fails. The result is cached by (content hash, language),
 * so each text is paid for once however many people read it. Fails open:
 * any error returns the original text, and the caller always offers it.
 *
 * Never use this for the language being taught (lesson phrases, role-play
 * lines, flashcards) — those stay in the target language by design.
 */

/** Longer than any bio or description the app stores; caps cost per call. */
export const MAX_DYNAMIC_TEXT_CHARS = 2000;

function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 32);
}

async function translateWithAI(text: string, lang: string): Promise<string | null> {
  try {
    const provider = await getAIProvider();
    const raw = await provider.generateJSON(
      `Translate the user-written text below into ${getNativeLangName(lang)} (${lang}). ` +
        'Keep names, numbers, URLs and line breaks. If it is already in that language, return it unchanged. ' +
        'Return strictly a JSON object: {"translation": "..."}\n\nText:\n' + text,
      [],
    );
    const parsed = JSON.parse(raw) as { translation?: unknown };
    return typeof parsed.translation === 'string' && parsed.translation.trim() ? parsed.translation : null;
  } catch (err) {
    console.warn('[translate-dynamic] AI fallback failed:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

export async function translateForUi(text: string, lang: string): Promise<string> {
  const source = text.slice(0, MAX_DYNAMIC_TEXT_CHARS);
  if (!source.trim() || !lang) return text;

  const k = cacheKeys.uiTranslation(hashText(source), lang);
  const cached = await cacheGet<string>(k);
  if (cached) return cached;

  let translated: string | null = null;
  if (isUgaJapaConfigured()) {
    const result = await translateTextSafe(source, lang);
    if (result.provider !== 'none') translated = result.translatedText;
  }
  translated ??= await translateWithAI(source, lang);
  if (!translated) return text;

  await cacheSet(k, translated, TTL.UI_TRANSLATION);
  return translated;
}
