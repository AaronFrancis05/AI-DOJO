'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Globe } from 'lucide-react';
import { UiLanguageSwitcher } from '@/components/ui/UiLanguageSwitcher';
import { useLanguageCatalog, useT, useUiLocale } from '@/lib/language-context';

/**
 * "Viewing in 日本語 · change" — shown only while the interface language is a
 * guess (from the visitor's country or browser) rather than a choice. "Keep"
 * turns the guess into a choice; "change" opens the switcher. Either one
 * stores the `ui-locale` cookie, so the notice does not come back.
 */
export function UiLocaleNotice() {
  const t = useT();
  const router = useRouter();
  const { locale, source } = useUiLocale();
  const { native } = useLanguageCatalog();
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);

  const guessed = source === 'country' || source === 'browser';
  if (!guessed || locale === 'en' || hidden) return null;

  const language = native.find((l) => l.code === locale);
  const name = language?.nativeName ?? language?.name ?? locale;

  async function keep() {
    setHidden(true);
    await fetch('/api/ui-locale', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale }),
    }).catch(() => null);
    router.refresh();
  }

  return (
    <div className="w-full border-b border-dojo-border bg-dojo-surface px-4 py-2">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-2 text-sm text-dojo-text-primary">
        <Globe className="h-4 w-4 shrink-0 text-dojo-text-muted" aria-hidden="true" />
        <span>{t('uiLanguage.viewingIn', { language: name })}</span>
        <span className="text-dojo-text-muted" aria-hidden="true">·</span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="font-medium text-dojo-accent hover:underline"
          aria-expanded={open}
        >
          {t('uiLanguage.change')}
        </button>
        <button
          type="button"
          onClick={keep}
          className="ms-auto rounded-lg px-2 py-1 text-xs font-medium text-dojo-text-muted hover:bg-dojo-surface-raised hover:text-dojo-text-primary"
        >
          {t('uiLanguage.keep')}
        </button>
        {open && (
          <div className="w-full max-w-xs pt-2">
            <UiLanguageSwitcher compact />
          </div>
        )}
      </div>
    </div>
  );
}
