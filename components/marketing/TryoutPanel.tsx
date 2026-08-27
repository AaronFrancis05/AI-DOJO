'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLanguageCatalog } from '@/lib/language-context';
import { ChevronRightIcon } from '@/components/Icons';

export function TryoutPanel() {
  const catalog = useLanguageCatalog();
  const [targetLanguage, setTargetLanguage] = useState(catalog.target[0]?.code ?? '');
  const [nativeLanguage, setNativeLanguage] = useState(catalog.native[0]?.code ?? '');

  return (
    <div className="rounded-2xl border border-dojo-border bg-dojo-surface-raised p-6 shadow-sm sm:p-8">
      <div className="grid items-center gap-6 lg:grid-cols-[1.2fr_1fr_1fr_auto]">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-dojo-accent">Try It Out</p>
          <h3 className="mt-2 text-xl font-bold text-dojo-text-primary sm:text-2xl">Experience AI Roleplay</h3>
          <p className="mt-2 text-sm leading-relaxed text-dojo-text-muted">
            Preview a short roleplay session and feel how real language practice can be.
          </p>
        </div>

        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wider text-dojo-text-muted">I want to learn</span>
          <select
            value={targetLanguage}
            onChange={(e) => setTargetLanguage(e.target.value)}
            className="mt-2 w-full rounded-xl border border-dojo-border bg-dojo-surface px-4 py-3 text-sm font-medium text-dojo-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-dojo-accent"
          >
            {catalog.target.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wider text-dojo-text-muted">I speak</span>
          <select
            value={nativeLanguage}
            onChange={(e) => setNativeLanguage(e.target.value)}
            className="mt-2 w-full rounded-xl border border-dojo-border bg-dojo-surface px-4 py-3 text-sm font-medium text-dojo-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-dojo-accent"
          >
            {catalog.native.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.name}
              </option>
            ))}
          </select>
        </label>

        <Link
          href={`/tryout?targetLanguage=${targetLanguage}&nativeLanguage=${nativeLanguage}`}
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-dojo-accent px-6 py-3 font-semibold text-white transition-all hover:bg-dojo-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dojo-accent"
        >
          Start Tryout
          <ChevronRightIcon className="h-4 w-4" />
        </Link>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-dojo-border pt-5 text-xs text-dojo-text-muted">
        <span>2&ndash;3 min experience</span>
        <span>No sign up required to preview</span>
        <span>See AI feedback</span>
      </div>
    </div>
  );
}
