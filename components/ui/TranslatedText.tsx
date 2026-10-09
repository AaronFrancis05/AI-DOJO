'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/design-tokens';
import { useT, useUiLocale } from '@/lib/language-context';

/**
 * User-written text (a tutor bio, a lesson title, an announcement) shown in
 * the reader's interface language, with the original one tap away.
 *
 * Translated on first view by POST /api/translate-text and cached there per
 * (text, language). Renders the original immediately and swaps when the
 * translation arrives; any failure just leaves the original.
 *
 * Not for the language being taught — that is never translated.
 */
export function TranslatedText({
  text,
  className,
  toggleClassName,
}: {
  text: string;
  className?: string;
  toggleClassName?: string;
}) {
  const t = useT();
  const { locale } = useUiLocale();
  // Keyed by what was translated, so a new text or locale never shows the
  // previous translation while its own is in flight.
  const requestKey = `${locale}|${text}`;
  const [result, setResult] = useState<{ key: string; value: string } | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const translated = result?.key === requestKey ? result.value : null;

  useEffect(() => {
    let cancelled = false;
    if (!text.trim()) return;
    fetch('/api/translate-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: [text], lang: locale }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { translations?: string[] } | null) => {
        const value = data?.translations?.[0];
        if (!cancelled && value && value.trim() !== text.trim()) setResult({ key: requestKey, value });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [text, locale, requestKey]);

  return (
    <>
      <span className={className}>{translated && !showOriginal ? translated : text}</span>
      {translated && (
        <button
          type="button"
          onClick={() => setShowOriginal((v) => !v)}
          className={cn('ms-2 text-xs font-medium text-dojo-accent hover:underline', toggleClassName)}
        >
          {showOriginal ? t('common.showTranslation') : t('common.showOriginal')}
        </button>
      )}
    </>
  );
}
