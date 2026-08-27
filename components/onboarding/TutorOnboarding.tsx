/* ───────────────────────────────────────────────
   Tutor onboarding wizard — the first-run flow for an account whose role is
   `tutor`. Walked instead of the learner wizard, not after it: the questions
   the learner flow asks (level, practice goal, domain, daily minutes)
   describe someone who practises, and a tutor answering them writes rows
   nothing reads.

   Steps live in lib/onboarding/steps.ts (TUTOR_ONBOARDING_STEPS); answers ride
   the same persisted OnboardingContext the learner wizard uses, so a refresh
   mid-flow doesn't lose them.
   ─────────────────────────────────────────────── */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { OnboardingShell } from './OnboardingShell';
import { InterstitialStep } from './InterstitialStep';
import { AvailabilityEditor } from '@/components/tutors/AvailabilityEditor';
import { LanguageSelectionPanel } from '@/components/ui/LanguageSelectionPanel';
import { Button } from '@/components/ui/Button';
import { useOnboarding, clearPersistedOnboarding } from '@/lib/onboarding/context';
import { TUTOR_ONBOARDING_STEPS } from '@/lib/onboarding/steps';
import { useLanguageCatalog } from '@/lib/language-context';
import { AlertCircleIcon } from '@/components/Icons';
import { CalendarClock, ClipboardCheck, Users } from 'lucide-react';

const BASE_PATH = '/onboarding/tutor';

const [WELCOME, LANGUAGE, AVAILABILITY, READY] = TUTOR_ONBOARDING_STEPS;

export function TutorOnboarding({ step }: { step: string }) {
  const router = useRouter();
  const { state, dispatch } = useOnboarding();
  const catalog = useLanguageCatalog();
  const [error, setError] = useState('');
  // The completing POST is fired from an effect, and an effect runs twice in
  // development. One attempt per mount, retried only on the button below.
  const completing = useRef(false);

  const goToStep = useCallback((key: string) => {
    router.push(`${BASE_PATH}/${key}`);
  }, [router]);

  /**
   * Finishes onboarding and hands the tutor to their console.
   *
   * Unlike the learner flow this must *not* navigate on failure: the (app)
   * gate reads `onboardingCompletedAt`, so pushing to /tutor without it
   * bounces straight back into this wizard. Failing loudly with a retry is
   * the only honest option.
   */
  const complete = useCallback(async () => {
    setError('');
    try {
      const res = await fetch('/api/user/onboarding', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nativeLanguage: state.nativeLanguage }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? 'Could not save your setup. Please try again.');
        return;
      }
      clearPersistedOnboarding();
      router.push('/tutor');
    } catch {
      setError('Network error. Please try again.');
    }
  }, [state.nativeLanguage, router]);

  useEffect(() => {
    if (step !== READY.key || completing.current) return;
    completing.current = true;
    void complete();
  }, [step, complete]);

  const stepContent: Record<string, React.ReactNode> = {
    [WELCOME.key]: (
      <InterstitialStep
        title={WELCOME.title}
        subtitle="A human reviews every tutor profile before it appears to learners. While that happens, let's get your console ready."
        onContinue={() => goToStep(LANGUAGE.key)}
      >
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="rounded-xl border border-dojo-border bg-dojo-surface/50 p-4">
            <Users className="mx-auto h-6 w-6 text-dojo-accent" />
            <p className="mt-2 text-xs leading-relaxed text-dojo-text-muted">Run group classes</p>
          </div>
          <div className="rounded-xl border border-dojo-border bg-dojo-surface/50 p-4">
            <ClipboardCheck className="mx-auto h-6 w-6 text-dojo-accent" />
            <p className="mt-2 text-xs leading-relaxed text-dojo-text-muted">Grade assessments</p>
          </div>
          <div className="rounded-xl border border-dojo-border bg-dojo-surface/50 p-4">
            <CalendarClock className="mx-auto h-6 w-6 text-dojo-accent" />
            <p className="mt-2 text-xs leading-relaxed text-dojo-text-muted">Take one-to-one bookings</p>
          </div>
        </div>
      </InterstitialStep>
    ),

    [LANGUAGE.key]: (
      <div className="flex flex-col gap-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-dojo-text-primary">{LANGUAGE.title}</h2>
          <p className="mt-2 text-sm text-dojo-text-muted">{LANGUAGE.subtitle}</p>
        </div>
        <LanguageSelectionPanel
          value={state.nativeLanguage}
          options={catalog.native}
          searchPlaceholder="Search your language..."
          onSelect={(code) => {
            dispatch({ type: 'SET_NATIVE_LANGUAGE', payload: code });
            dispatch({ type: 'COMPLETE_STEP', payload: AVAILABILITY.key });
            goToStep(AVAILABILITY.key);
          }}
        />
      </div>
    ),

    [AVAILABILITY.key]: (
      <div className="flex flex-col gap-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-dojo-text-primary">{AVAILABILITY.title}</h2>
          <p className="mt-2 text-sm text-dojo-text-muted">{AVAILABILITY.subtitle}</p>
        </div>
        {/* Saved hours advance the wizard; skipping leaves the tutor with a
            profile that simply isn't bookable yet, which the console says. */}
        <AvailabilityEditor
          saveLabel="Save and continue"
          onSaved={() => goToStep(READY.key)}
        />
        <button
          type="button"
          onClick={() => goToStep(READY.key)}
          className="text-sm text-dojo-text-muted hover:text-dojo-text-primary"
        >
          Skip for now — I&apos;ll set my hours later
        </button>
      </div>
    ),

    [READY.key]: error ? (
      <div className="flex flex-col items-center gap-6 py-8 text-center">
        <div className="flex items-center gap-2 rounded-lg border border-dojo-danger/30 bg-dojo-danger/10 px-3 py-2.5 text-sm text-dojo-danger">
          <AlertCircleIcon className="h-4 w-4 shrink-0" />
          {error}
        </div>
        <Button variant="primary" size="lg" onClick={() => void complete()}>
          Try again
        </Button>
      </div>
    ) : (
      <InterstitialStep title={READY.title} loading autoAdvance>
        <p className="text-sm text-dojo-text-muted">Opening your teaching console…</p>
      </InterstitialStep>
    ),
  };

  return (
    <OnboardingShell
      currentStep={step}
      steps={TUTOR_ONBOARDING_STEPS}
      basePath={BASE_PATH}
      // Not /tutor: the (app) gate sends an unfinished tutor straight back
      // here, so "back" out of the first step would land on itself.
      exitHref="/"
    >
      {stepContent[step] ?? (
        <div className="py-12 text-center">
          <p className="text-dojo-text-muted">Step not found</p>
          <Button variant="ghost" className="mt-4" onClick={() => goToStep(WELCOME.key)}>
            Start over
          </Button>
        </div>
      )}
    </OnboardingShell>
  );
}
