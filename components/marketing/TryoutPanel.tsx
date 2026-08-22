'use client';

import { useState } from 'react';
import Link from 'next/link';
import { TARGET_LANGUAGES } from '@/lib/language';
import { ChevronRightIcon } from '@/components/Icons';

interface TryoutPanelProps {
  scenarios: string[];
}

export function TryoutPanel({ scenarios }: TryoutPanelProps) {
  const [languageCode, setLanguageCode] = useState(TARGET_LANGUAGES[0]?.code ?? '');
  const [scenarioName, setScenarioName] = useState(scenarios[0] ?? '');

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
            value={languageCode}
            onChange={(e) => setLanguageCode(e.target.value)}
            className="mt-2 w-full rounded-xl border border-dojo-border bg-dojo-surface px-4 py-3 text-sm font-medium text-dojo-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-dojo-accent"
          >
            {TARGET_LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wider text-dojo-text-muted">Scenario</span>
          <select
            value={scenarioName}
            onChange={(e) => setScenarioName(e.target.value)}
            className="mt-2 w-full rounded-xl border border-dojo-border bg-dojo-surface px-4 py-3 text-sm font-medium text-dojo-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-dojo-accent"
          >
            {scenarios.map((scenario) => (
              <option key={scenario} value={scenario}>
                {scenario}
              </option>
            ))}
          </select>
        </label>

        <Link
          href={`/auth?lang=${languageCode}&scenario=${encodeURIComponent(scenarioName)}`}
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
