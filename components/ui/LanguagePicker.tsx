'use client';

import { useState, useRef, useEffect } from 'react';
import { TARGET_LANGUAGES, NATIVE_LANGUAGES, getNativeLangName } from '@/lib/language';
import { ChevronDown, Check } from 'lucide-react';

interface LanguagePickerProps {
  targetLanguage: string;
  nativeLanguage: string;
  onTargetChange: (code: string) => void;
  onNativeChange: (code: string) => void;
}

function Selector({
  label,
  value,
  options,
  onChange,
  compact,
}: {
  label: string;
  value: string;
  options: { code: string; name: string; nativeName?: string }[];
  onChange: (code: string) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const selected = options.find(o => o.code === value);

  return (
    <div ref={ref} className="relative">
      <label className="block text-[11px] font-medium text-dojo-text-muted mb-1.5 uppercase tracking-wider">
        {label}
      </label>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center justify-between gap-2 w-full rounded-[--radius-md] border border-dojo-border bg-dojo-surface-raised px-3 py-2 text-sm text-dojo-text-primary hover:border-dojo-accent transition-colors"
      >
        <span>
          {compact
            ? (selected?.nativeName ?? selected?.name ?? value)
            : `${selected?.nativeName ?? ''} (${selected?.name ?? value})`}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 text-dojo-text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-[--radius-md] border border-dojo-border bg-dojo-sidebar shadow-xl max-h-48 overflow-y-auto">
          {options.map(opt => (
            <button
              key={opt.code}
              type="button"
              onClick={() => { onChange(opt.code); setOpen(false); }}
              className={`flex items-center gap-2 w-full px-3 py-2 text-left text-sm transition-colors hover:bg-dojo-surface-raised ${
                opt.code === value ? 'text-dojo-accent' : 'text-dojo-text-primary'
              }`}
            >
              <span className="flex-1">{opt.nativeName ?? opt.name}</span>
              {opt.name !== (opt.nativeName ?? opt.name) && (
                <span className="text-[11px] text-dojo-text-muted">{opt.name}</span>
              )}
              {opt.code === value && <Check className="h-3.5 w-3.5 text-dojo-accent shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function LanguagePicker({ targetLanguage, nativeLanguage, onTargetChange, onNativeChange }: LanguagePickerProps) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-dojo-text-primary mb-1">Language Settings</h3>
        <p className="text-xs text-dojo-text-muted">Choose the language you want to practice and your native language for translations.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Selector
          label="Target Language"
          value={targetLanguage}
          options={TARGET_LANGUAGES}
          onChange={onTargetChange}
        />
        <Selector
          label="Native Language"
          value={nativeLanguage}
          options={NATIVE_LANGUAGES}
          onChange={onNativeChange}
        />
      </div>
    </div>
  );
}
