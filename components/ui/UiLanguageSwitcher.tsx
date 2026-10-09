'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LanguageSelector } from '@/components/ui/LanguagePicker';
import { useLanguageCatalog, useT, useUiLocale } from '@/lib/language-context';

/**
 * Picks the interface language (buttons, menus, headings). Stored in the
 * `ui-locale` cookie by POST /api/ui-locale, which outranks every guess from
 * then on; the page then re-renders on the server in the new language.
 *
 * Never changes the learning pair — the language being taught and the
 * explanation language live in the learner's profile (LanguagePicker).
 */
export function UiLanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const router = useRouter();
  const { locale } = useUiLocale();
  const { native } = useLanguageCatalog();
  const [error, setError] = useState<string | null>(null);

  async function choose(code: string) {
    if (code === locale) return;
    setError(null);
    const res = await fetch('/api/ui-locale', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale: code }),
    }).catch(() => null);
    if (!res?.ok) {
      setError(t('uiLanguage.saveFailed'));
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <LanguageSelector
        label={t('uiLanguage.label')}
        value={locale}
        options={native}
        onChange={choose}
        compact={compact}
      />
      {!compact && <p className="text-xs text-dojo-text-muted">{t('uiLanguage.description')}</p>}
      {error && <p role="alert" className="text-xs text-dojo-danger">{error}</p>}
    </div>
  );
}
