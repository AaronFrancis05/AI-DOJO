'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Volume2, User, ArrowLeft } from 'lucide-react';
import { useLanguageCatalog } from '@/lib/language-context';
import { saveTryoutParams, loadTryoutParams } from '@/lib/tryout/guest-params';
import { useTryoutGate } from '@/lib/hooks/useTryoutGate';
import { TryoutBlockedScreen } from '@/components/marketing/TryoutBlockedScreen';

export default function TryoutChooserPage() {
  // useSearchParams needs a Suspense boundary in the app router
  return (
    <Suspense fallback={null}>
      <TryoutChooserContent />
    </Suspense>
  );
}

function TryoutChooserContent() {
  const catalog = useLanguageCatalog();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryTarget = searchParams.get('targetLanguage');
  const queryNative = searchParams.get('nativeLanguage');

  const [params] = useState(() => {
    if (queryTarget && queryNative) return { targetLanguage: queryTarget, nativeLanguage: queryNative };
    return loadTryoutParams();
  });

  // Checked here rather than only on the mode pages so a guest who is out of
  // previews is told so before they pick a mode.
  const gate = useTryoutGate();

  useEffect(() => {
    if (queryTarget && queryNative) {
      saveTryoutParams({ targetLanguage: queryTarget, nativeLanguage: queryNative });
    } else if (!params) {
      router.replace('/');
    }
  }, [queryTarget, queryNative, params, router]);

  if (!params || gate.state === 'checking') {
    return (
      <div className="flex h-dvh items-center justify-center bg-dojo-canvas">
        <div className="animate-pulse text-dojo-text-muted text-sm">Loading…</div>
      </div>
    );
  }

  const { targetLanguage, nativeLanguage } = params;

  if (gate.state === 'blocked') {
    return (
      <TryoutBlockedScreen
        targetLanguage={targetLanguage}
        nativeLanguage={nativeLanguage}
        retryAfterMs={gate.retryAfterMs}
      />
    );
  }

  const targetLangName = catalog.target.find((l) => l.code === targetLanguage)?.name ?? targetLanguage;
  const nativeLangName = catalog.native.find((l) => l.code === nativeLanguage)?.name ?? nativeLanguage;

  const qs = `targetLanguage=${targetLanguage}&nativeLanguage=${nativeLanguage}`;
  const modes = [
    {
      key: 'voice',
      label: 'Voice',
      desc: 'Speak your responses hands-free.',
      icon: Volume2,
      href: `/tryout/voice?${qs}`,
      color: 'border-[#3FB27F] hover:bg-[#3FB27F]/10',
      iconColor: 'text-[#3FB27F]',
    },
    {
      key: 'avatar',
      label: 'Avatar',
      desc: 'Full avatar voice conversation with barge-in.',
      icon: User,
      href: `/tryout/avatar?${qs}`,
      color: 'border-[#8B5CF6] hover:bg-[#8B5CF6]/10',
      iconColor: 'text-[#8B5CF6]',
    },
  ];

  return (
    <div className="flex h-dvh flex-col bg-dojo-canvas">
      <div className="flex items-center gap-2 px-4 py-4 border-b border-dojo-border shrink-0">
        <Link href="/" className="text-dojo-text-muted hover:text-dojo-text-primary">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <span className="text-sm font-semibold text-dojo-text-primary">
          Preview: {targetLangName} for {nativeLangName} speakers
        </span>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="mb-8 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-dojo-accent">Try It Out</p>
          <h1 className="mt-2 text-2xl font-bold text-dojo-text-primary sm:text-3xl">Choose how you&apos;d like to practice</h1>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl w-full">
          {modes.map((mode) => {
            const Icon = mode.icon;
            return (
              <Link
                key={mode.key}
                href={mode.href}
                className={`flex flex-col items-center gap-4 p-8 rounded-2xl border-2 bg-dojo-surface/60 backdrop-blur-sm transition-all duration-200 ${mode.color} group`}
              >
                <div className={`h-14 w-14 rounded-full flex items-center justify-center border-2 border-current ${mode.iconColor} group-hover:scale-110 transition-transform`}>
                  <Icon className="h-6 w-6" />
                </div>
                <div className="text-center">
                  <p className="text-base font-bold text-dojo-text-primary">{mode.label}</p>
                  <p className="text-xs text-dojo-text-muted mt-1">{mode.desc}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
