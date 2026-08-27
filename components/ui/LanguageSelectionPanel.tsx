'use client';

import { useState } from 'react';
import { useLanguageCatalog } from '@/lib/language-context';
import { Search, CheckCircle2 } from 'lucide-react';

export interface LanguageOption {
  code: string;
  name: string;
  nativeName?: string;
  flag?: string;
  hasPhonetic?: boolean;
  ttsSupported?: boolean;
}

interface LanguageSelectionPanelProps {
  value: string;
  onSelect: (code: string) => void;
  options?: LanguageOption[];
  searchPlaceholder?: string;
  maxHeightClass?: string;
  showBadges?: boolean;
}

export function LanguageSelectionPanel({
  value,
  onSelect,
  options,
  searchPlaceholder = 'Search languages...',
  maxHeightClass = 'max-h-96',
  showBadges = true,
}: LanguageSelectionPanelProps) {
  const catalog = useLanguageCatalog();
  const [query, setQuery] = useState('');

  // Resolved here rather than as a default parameter — the catalogue comes
  // from a hook, and a default parameter cannot call one.
  const resolved = options ?? catalog.target;

  const filtered = resolved.filter((l) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      l.name.toLowerCase().includes(q) ||
      (l.nativeName ?? '').toLowerCase().includes(q) ||
      l.code.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dojo-text-muted" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full rounded-lg border border-dojo-border bg-dojo-surface py-2 pl-9 pr-4 text-sm text-dojo-text-primary outline-none transition placeholder:text-dojo-text-muted/60 focus:border-dojo-accent focus:ring-2 focus:ring-dojo-accent/20"
        />
      </div>

      <div className={`overflow-y-auto rounded-xl border border-dojo-border bg-dojo-surface ${maxHeightClass}`}>
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-sm text-dojo-text-muted">
            No languages match &quot;{query}&quot;
          </div>
        ) : (
          <div className="flex flex-col">
            {filtered.map((lang) => {
              const selected = lang.code === value;
              return (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => onSelect(lang.code)}
                  className={`flex items-center gap-3 border-b border-dojo-border/60 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-dojo-surface-raised ${
                    selected ? 'bg-dojo-accent/5' : ''
                  }`}
                >
                  <span className="text-xl leading-none">{lang.flag ?? '🌐'}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-dojo-text-primary">
                      {lang.nativeName ?? lang.name}
                    </span>
                    <span className="block truncate text-xs text-dojo-text-muted">
                      {lang.name}
                    </span>
                  </span>
                  {showBadges && (lang.hasPhonetic !== undefined || lang.ttsSupported !== undefined) && (
                    <span className="flex shrink-0 items-center gap-1.5">
                      {lang.hasPhonetic && (
                        <span className="rounded-full border border-dojo-border px-2 py-0.5 text-[10px] text-dojo-text-muted">
                          phonetics
                        </span>
                      )}
                      {lang.ttsSupported !== undefined && (lang.ttsSupported ? (
                        <span className="rounded-full bg-dojo-success/10 px-2 py-0.5 text-[10px] text-dojo-success">
                          voice
                        </span>
                      ) : (
                        <span className="rounded-full border border-dojo-border px-2 py-0.5 text-[10px] text-dojo-text-muted">
                          text-only
                        </span>
                      ))}
                    </span>
                  )}
                  {selected && (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-dojo-accent" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
