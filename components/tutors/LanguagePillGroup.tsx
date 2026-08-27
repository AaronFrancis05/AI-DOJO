'use client';

import { cn } from '@/lib/design-tokens';

export interface LanguagePillOption {
  code: string;
  name: string;
}

/**
 * A multi-select over language codes, rendered as toggle pills.
 *
 * A tutor declares two of these — the languages they teach and the languages
 * they explain in — and the admin console edits the same two on their behalf.
 * One component so the three surfaces cannot drift on selected-state styling,
 * which is the kind of thing that silently diverges when it is copied.
 *
 * Deliberately not `components/ui/Pill`: that one is a single toggle with its
 * own `variant` vocabulary, and this is a group with a label and an empty
 * state. Kept here rather than in `ui/` because it is language-specific.
 */
export function LanguagePillGroup({
  label,
  hint,
  options,
  selected,
  onToggle,
  disabled = false,
}: {
  label: string;
  hint?: string;
  options: LanguagePillOption[];
  selected: string[];
  onToggle: (code: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-dojo-text-muted">{label}</label>
      {hint && <p className="text-xs leading-relaxed text-dojo-text-muted/80">{hint}</p>}
      {options.length === 0 ? (
        <p className="text-xs text-dojo-text-muted">No languages are available yet.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {options.map((lang) => {
            const isSelected = selected.includes(lang.code);
            return (
              <button
                key={lang.code}
                type="button"
                disabled={disabled}
                onClick={() => onToggle(lang.code)}
                aria-pressed={isSelected}
                className={cn(
                  'rounded-full border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-40',
                  isSelected
                    ? 'border-dojo-accent bg-dojo-accent/10 text-dojo-text-primary'
                    : 'border-dojo-border bg-dojo-surface-raised text-dojo-text-muted hover:border-dojo-accent/50',
                )}
              >
                {lang.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
