'use client';

import { Sparkles, LoaderIcon } from 'lucide-react';

interface InterstitialStepProps {
  title: string;
  subtitle?: string;
  autoAdvance?: boolean;
  onContinue?: () => void;
  loading?: boolean;
  children?: React.ReactNode;
}

export function InterstitialStep({ title, subtitle, autoAdvance, onContinue, loading, children }: InterstitialStepProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-12 text-center">
      {loading ? (
        <LoaderIcon className="h-12 w-12 animate-spin text-dojo-accent" />
      ) : (
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-dojo-accent/10">
          <Sparkles className="h-8 w-8 text-dojo-accent" />
        </div>
      )}
      <div>
        <h2 className="text-2xl font-bold text-dojo-text-primary">{title}</h2>
        {subtitle && <p className="mt-2 text-sm text-dojo-text-muted">{subtitle}</p>}
      </div>
      {children}
      {!autoAdvance && onContinue && (
        <button
          type="button"
          onClick={onContinue}
          className="mt-4 rounded-lg bg-dojo-accent px-8 py-3 font-semibold text-white transition-opacity hover:opacity-90"
        >
          Continue
        </button>
      )}
    </div>
  );
}
