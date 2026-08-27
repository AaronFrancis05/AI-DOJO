'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ONBOARDING_STEPS, type StepConfig } from '@/lib/onboarding/steps';
import { ArrowLeft } from 'lucide-react';

function OnboardingShellInner({ children, stepIndex, totalSteps, isTransition, navigateBack }: {
  children: React.ReactNode;
  stepIndex: number;
  totalSteps: number;
  isTransition: boolean;
  navigateBack: () => void;
}) {
  const progressPercent = ((stepIndex + 1) / totalSteps) * 100;

  return (
    <div className="flex min-h-dvh flex-col bg-gradient-to-br from-dojo-accent/5 via-dojo-canvas to-dojo-success/5">
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col px-6 pt-8">
        <div className="mb-8 flex items-center gap-3">
          <button
            type="button"
            onClick={navigateBack}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-dojo-border bg-dojo-surface text-dojo-text-muted hover:text-dojo-text-primary"
            aria-label="Go back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1">
            <div className="h-2 w-full overflow-hidden rounded-full bg-dojo-border">
              <div
                className="h-full rounded-full bg-dojo-accent transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
          <span className="text-xs font-medium text-dojo-text-muted">
            {stepIndex + 1}/{totalSteps}
          </span>
        </div>

        <div className={`flex-1 ${isTransition ? 'flex items-center justify-center' : ''}`}>
          <div className={`w-full ${isTransition ? '' : 'rounded-2xl border border-dojo-border bg-dojo-sidebar p-8 shadow-xl'}`}>
            {children}
          </div>
        </div>

        <div className="py-6 text-center">
          <div className="flex items-center justify-center gap-1.5">
            <img src="/logo.png" alt="" className="h-4 w-4" />
            <p className="text-xs text-dojo-text-muted">AI DOJO</p>
          </div>
        </div>
      </div>
    </div>
  );
}

interface OnboardingShellProps {
  children: React.ReactNode;
  currentStep: string;
  /** The wizard being walked. Defaults to the learner one; the tutor wizard
   *  passes `TUTOR_ONBOARDING_STEPS`. Progress, back and the interstitial
   *  layout all read from it, so a wizard only has to declare its steps once. */
  steps?: StepConfig[];
  /** Where a step key resolves against, e.g. `/onboarding/tutor`. */
  basePath?: string;
  /** Where "back" goes from the first step. */
  exitHref?: string;
}

export function OnboardingShell({
  children,
  currentStep,
  steps = ONBOARDING_STEPS,
  basePath = '/onboarding',
  exitHref = '/auth',
}: OnboardingShellProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const stepKeys = steps.map((s) => s.key);
  const currentIndex = stepKeys.indexOf(currentStep);
  const isTransition = steps.some((s) => s.key === currentStep && s.transition);
  const prevStepRef = useRef(currentStep);

  useEffect(() => {
    if (mounted && currentStep !== 'personalizing' && currentStep !== 'plan-ready') {
      prevStepRef.current = currentStep;
    }
  }, [currentStep, mounted]);

  const navigateBack = () => {
    const idx = stepKeys.indexOf(currentStep);
    if (idx <= 0) {
      router.push(exitHref);
      return;
    }
    router.push(`${basePath}/${stepKeys[idx - 1]}`);
  };

  if (!mounted) return null;

  return (
    <OnboardingShellInner
      stepIndex={currentIndex}
      totalSteps={stepKeys.length}
      isTransition={isTransition}
      navigateBack={navigateBack}
    >
      {children}
    </OnboardingShellInner>
  );
}
