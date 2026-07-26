'use client';

import { Check } from 'lucide-react';

interface Option {
  value: string;
  label: string;
  description?: string;
}

interface SingleSelectStepProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  title: string;
  subtitle?: string;
  skippable?: boolean;
  onSkip?: () => void;
}

export function SingleSelectStep({ options, value, onChange, title, subtitle, skippable, onSkip }: SingleSelectStepProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-dojo-text-primary">{title}</h2>
        {subtitle && <p className="mt-2 text-sm text-dojo-text-muted">{subtitle}</p>}
      </div>
      <div className="flex flex-col gap-3">
        {options.map((opt) => {
          const selected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`flex items-start gap-4 rounded-xl border p-4 text-left transition-all ${
                selected
                  ? 'border-dojo-accent bg-dojo-accent/5 ring-2 ring-dojo-accent/20'
                  : 'border-dojo-border bg-dojo-surface hover:border-dojo-accent/50 hover:bg-dojo-surface-raised'
              }`}
            >
              <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                selected ? 'border-dojo-accent bg-dojo-accent' : 'border-dojo-text-muted'
              }`}>
                {selected && <Check className="h-3 w-3 text-white" />}
              </div>
              <div className="flex-1">
                <div className={`font-semibold ${selected ? 'text-dojo-accent' : 'text-dojo-text-primary'}`}>
                  {opt.label}
                </div>
                {opt.description && (
                  <div className="mt-0.5 text-sm text-dojo-text-muted">{opt.description}</div>
                )}
              </div>
            </button>
          );
        })}
      </div>
      {skippable && (
        <button
          type="button"
          onClick={onSkip}
          className="text-center text-sm text-dojo-text-muted hover:text-dojo-text-primary underline underline-offset-2"
        >
          Skip for now
        </button>
      )}
    </div>
  );
}
