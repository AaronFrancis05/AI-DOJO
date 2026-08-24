'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { PartyPopper, Sparkles } from 'lucide-react';
import { getTargetLangConfig } from '@/lib/language';
import { useCelebrationConfetti } from '@/lib/hooks/useCelebrationConfetti';

interface TryoutCompleteScreenProps {
  targetLanguage: string;
  nativeLanguage: string;
  turnCount: number;
}

export function TryoutCompleteScreen({ targetLanguage, nativeLanguage, turnCount }: TryoutCompleteScreenProps) {
  const targetLangName = getTargetLangConfig(targetLanguage).name;
  const { fireBurst } = useCelebrationConfetti();

  useEffect(() => {
    fireBurst('full');
  }, [fireBurst]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-dojo-canvas/95 backdrop-blur-sm px-4">
      <div className="w-full max-w-md rounded-2xl border border-dojo-border bg-dojo-surface-raised p-8 text-center shadow-2xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-dojo-accent/15 ring-1 ring-dojo-accent/30">
          <PartyPopper className="h-7 w-7 text-dojo-accent" />
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-dojo-text-primary">Nice work!</h1>
        <p className="mt-2 text-sm leading-relaxed text-dojo-text-muted">
          You just practiced {turnCount} {turnCount === 1 ? 'exchange' : 'exchanges'} of real {targetLangName} conversation.
          Create a free account to keep learning with full lessons, corrections, and progress tracking.
        </p>

        <Link
          href={`/auth?targetLanguage=${targetLanguage}&nativeLanguage=${nativeLanguage}`}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-dojo-accent px-6 py-3 font-semibold text-white transition-all hover:bg-dojo-accent/90"
        >
          <Sparkles className="h-4 w-4" />
          Create your free account
        </Link>
        <Link
          href="/"
          className="mt-3 block text-xs font-medium text-dojo-text-muted hover:text-dojo-text-primary"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
