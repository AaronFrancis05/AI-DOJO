'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, useCallback, useRef } from 'react';
import {
  useOnboarding,
  clearPersistedOnboarding,
} from '@/lib/onboarding/context';
import {
  ONBOARDING_STEPS, LEVEL_OPTIONS, GOAL_OPTIONS,
  MODE_OPTIONS, AGE_OPTIONS, FREQUENCY_OPTIONS,
} from '@/lib/onboarding/steps';
import { SingleSelectStep, InterstitialStep, OnboardingShell } from '@/components/onboarding';
import { LanguageSelectionPanel } from '@/components/ui/LanguageSelectionPanel';
import { useLanguageCatalog } from '@/lib/language-context';
import { Sparkles, MessageSquare, BookOpen, CheckCircle2, LoaderIcon } from 'lucide-react';

const [
  WELCOME,
  LEVEL,
  SOCIAL_PROOF,
  GOAL,
  TRANSITION_1,
  DOMAIN,
  MODE,
  TRANSITION_2,
  AGE,
  TARGET_LANGUAGE,
  NATIVE_LANGUAGE,
  FREQUENCY,
  PERSONALIZING,
  PLAN_READY,
] = ONBOARDING_STEPS;

type StepComponent = React.ReactNode;

export default function OnboardingStepPage() {
  const params = useParams();
  const router = useRouter();
  const step = params.step as string;
  const { state, dispatch } = useOnboarding();
  const catalog = useLanguageCatalog();
  const [saving, setSaving] = useState(false);
  const [dbDomains, setDbDomains] = useState<{ id: number; name: string; icon: string; description: string }[]>([]);
  const [loadingDomains, setLoadingDomains] = useState(false);
  // The completing POST is fired from an effect, and an effect runs twice in
  // development. One attempt per mount of the last step.
  const completing = useRef(false);

  useEffect(() => {
    if (step === DOMAIN.key && dbDomains.length === 0 && !loadingDomains) {
      // This marks the externally loaded domain request in flight, preventing
      // duplicate requests while its promise is pending.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoadingDomains(true);
      fetch('/api/domains', { credentials: 'include' })
        .then(r => r.json())
        .then(data => {
          setDbDomains(Array.isArray(data) ? data : data?.domains ?? []);
        })
        .catch(() => {
          setDbDomains([
            { id: 1, name: 'Restaurant', icon: 'UtensilsCrossed', description: 'Order food and interact with staff.' },
            { id: 2, name: 'Hotel', icon: 'Building2', description: 'Check in, request services, and more.' },
            { id: 7, name: 'Airport', icon: 'Plane', description: 'Navigate check-in, boarding, and customs.' },
            { id: 4, name: 'Hospital', icon: 'HeartPulse', description: 'Describe symptoms and understand medical advice.' },
            { id: 5, name: 'Business', icon: 'Briefcase', description: 'Handle meetings, emails, and negotiations.' },
            { id: 6, name: 'Travel', icon: 'Compass', description: 'Get around with directions and local tips.' },
            { id: 3, name: 'Shopping', icon: 'ShoppingBag', description: 'Browse, ask questions, and make purchases.' },
          ]);
        })
        .finally(() => setLoadingDomains(false));
    }
  }, [step, dbDomains.length, loadingDomains]);

  /**
   * Saves the wizard's answers and hands the learner off.
   *
   * The first practice pick is a Library domain, so that is the landing.
   * Enrolment still runs in the same POST (Courses / calendar stay populated)
   * and is the fallback when the domain cannot be resolved. /home is last.
   */
  const submitOnboarding = useCallback(async () => {
    const onboardingPayload: Record<string, unknown> = {};
    if (state.level) onboardingPayload.level = state.level;
    if (state.learningGoal) onboardingPayload.learningGoal = state.learningGoal;
    if (state.preferredDomainId) onboardingPayload.preferredDomainId = state.preferredDomainId;
    if (state.preferredMode) onboardingPayload.preferredMode = state.preferredMode;
    if (state.ageRange) onboardingPayload.ageRange = state.ageRange;
    if (state.targetLanguage) onboardingPayload.preferredTargetLanguage = state.targetLanguage;
    if (state.nativeLanguage) onboardingPayload.nativeLanguage = state.nativeLanguage;
    if (state.dailyGoalMinutes) onboardingPayload.dailyGoalMinutes = state.dailyGoalMinutes;

    let destination = '/home';
    try {
      const res = await fetch('/api/user/onboarding', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(onboardingPayload),
      });
      const data = await res.json().catch(() => null);
      if (data?.domainSlug) {
        destination = `/dojo/${data.domainSlug}`;
      } else if (data?.courseSlug) {
        destination = `/courses/${data.courseSlug}?target=${data.targetLanguage ?? state.targetLanguage}&native=${data.nativeLanguage ?? state.nativeLanguage}`;
      }
    } catch {
      // The account exists either way — send them into the app rather than
      // stranding them on the last step of a wizard they have finished.
    }

    clearPersistedOnboarding();
    router.push(destination);
  }, [state, router]);

  useEffect(() => {
    if (step === PERSONALIZING.key) {
      const t = setTimeout(() => router.push(`/onboarding/${PLAN_READY.key}`), 2000);
      return () => clearTimeout(t);
    }
  }, [step, router]);

  useEffect(() => {
    if (step !== PLAN_READY.key) return;
    const t = setTimeout(() => {
      if (completing.current) return;
      completing.current = true;
      setSaving(true);
      void submitOnboarding();
    }, 2500);
    return () => clearTimeout(t);
  }, [step, submitOnboarding]);

  const goToStep = useCallback((key: string) => {
    router.push(`/onboarding/${key}`);
  }, [router]);

  const selectAndAdvance = useCallback((type: string, payload: unknown, nextStep: string) => {
    dispatch({ type: type as never, payload: payload as never });
    dispatch({ type: 'COMPLETE_STEP', payload: nextStep });
    goToStep(nextStep);
  }, [dispatch, goToStep]);

  const stepContent: Record<string, StepComponent> = {
    [WELCOME.key]: (
      <InterstitialStep
        title={WELCOME.title}
        subtitle={WELCOME.subtitle}
        onContinue={() => goToStep(LEVEL.key)}
      />
    ),
    [LEVEL.key]: (
      <SingleSelectStep
        options={LEVEL_OPTIONS}
        value={state.level}
        onChange={(v) => selectAndAdvance('SET_LEVEL', v, SOCIAL_PROOF.key)}
        title={LEVEL.title}
        subtitle={LEVEL.subtitle}
      />
    ),
    [SOCIAL_PROOF.key]: (
      <InterstitialStep
        title="You're in good company"
        onContinue={() => goToStep(GOAL.key)}
      >
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="rounded-xl border border-dojo-border bg-dojo-surface/50 p-4">
            <BookOpen className="mx-auto h-6 w-6 text-dojo-accent" />
            <p className="mt-2 text-lg font-bold text-dojo-text-primary">{dbDomains.length || '7'}+</p>
            <p className="text-xs text-dojo-text-muted">Real-world Domains</p>
          </div>
          <div className="rounded-xl border border-dojo-border bg-dojo-surface/50 p-4">
            <MessageSquare className="mx-auto h-6 w-6 text-dojo-accent" />
            <p className="mt-2 text-lg font-bold text-dojo-text-primary">3</p>
            <p className="text-xs text-dojo-text-muted">Practice Modes</p>
          </div>
          <div className="rounded-xl border border-dojo-border bg-dojo-surface/50 p-4">
            <Sparkles className="mx-auto h-6 w-6 text-dojo-accent" />
            <p className="mt-2 text-lg font-bold text-dojo-text-primary">AI</p>
            <p className="text-xs text-dojo-text-muted">Powered Learning</p>
          </div>
        </div>
      </InterstitialStep>
    ),
    [GOAL.key]: (
      <SingleSelectStep
        options={GOAL_OPTIONS}
        value={state.learningGoal}
        onChange={(v) => selectAndAdvance('SET_LEARNING_GOAL', v, TRANSITION_1.key)}
        title={GOAL.title}
        subtitle={GOAL.subtitle}
      />
    ),
    [TRANSITION_1.key]: (
      <InterstitialStep
        title="Great! Let's get you started!"
        onContinue={() => goToStep(DOMAIN.key)}
      />
    ),
    [DOMAIN.key]: (
      <div className="flex flex-col gap-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-dojo-text-primary">{DOMAIN.title}</h2>
          <p className="mt-2 text-sm text-dojo-text-muted">{DOMAIN.subtitle}</p>
        </div>
        {loadingDomains ? (
          <div className="flex items-center justify-center py-8">
            <LoaderIcon className="h-6 w-6 animate-spin text-dojo-accent" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {dbDomains.map((d) => {
              const selected = state.preferredDomainId === d.id;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => {
                    dispatch({ type: 'SET_PREFERRED_DOMAIN', payload: { id: d.id, name: d.name } });
                    dispatch({ type: 'COMPLETE_STEP', payload: MODE.key });
                    goToStep(MODE.key);
                  }}
                  className={`flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition-all ${
                    selected
                      ? 'border-dojo-accent bg-dojo-accent/5 ring-2 ring-dojo-accent/20'
                      : 'border-dojo-border bg-dojo-surface hover:border-dojo-accent/50'
                  }`}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-dojo-accent/10 text-dojo-accent">
                    <BookOpen className="h-5 w-5" />
                  </div>
                  <span className="text-sm font-semibold text-dojo-text-primary">{d.name}</span>
                  <span className="text-xs text-dojo-text-muted line-clamp-2">{d.description}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    ),
    [MODE.key]: (
      <SingleSelectStep
        options={MODE_OPTIONS}
        value={state.preferredMode}
        onChange={(v) => selectAndAdvance('SET_PREFERRED_MODE', v, TRANSITION_2.key)}
        title={MODE.title}
        subtitle={MODE.subtitle}
      />
    ),
    [TRANSITION_2.key]: (
      <InterstitialStep
        title="You're almost set up!"
        onContinue={() => goToStep(AGE.key)}
      />
    ),
    [AGE.key]: (
      <SingleSelectStep
        options={AGE_OPTIONS}
        value={state.ageRange}
        onChange={(v) => selectAndAdvance('SET_AGE_RANGE', v, TARGET_LANGUAGE.key)}
        title={AGE.title}
        subtitle={AGE.subtitle}
        skippable={true}
        onSkip={() => goToStep(TARGET_LANGUAGE.key)}
      />
    ),
    [TARGET_LANGUAGE.key]: (
      <div className="flex flex-col gap-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-dojo-text-primary">{TARGET_LANGUAGE.title}</h2>
          <p className="mt-2 text-sm text-dojo-text-muted">{TARGET_LANGUAGE.subtitle}</p>
        </div>
        <LanguageSelectionPanel
          value={state.targetLanguage}
          onSelect={(code) => {
            dispatch({ type: 'SET_TARGET_LANGUAGE', payload: code });
            dispatch({ type: 'COMPLETE_STEP', payload: NATIVE_LANGUAGE.key });
            goToStep(NATIVE_LANGUAGE.key);
          }}
        />
      </div>
    ),
    [NATIVE_LANGUAGE.key]: (
      <div className="flex flex-col gap-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-dojo-text-primary">{NATIVE_LANGUAGE.title}</h2>
          <p className="mt-2 text-sm text-dojo-text-muted">{NATIVE_LANGUAGE.subtitle}</p>
        </div>
        <LanguageSelectionPanel
          value={state.nativeLanguage}
          options={catalog.native}
          searchPlaceholder="Search your native language..."
          onSelect={(code) => {
            dispatch({ type: 'SET_NATIVE_LANGUAGE', payload: code });
            dispatch({ type: 'COMPLETE_STEP', payload: FREQUENCY.key });
            goToStep(FREQUENCY.key);
          }}
        />
      </div>
    ),
    [FREQUENCY.key]: (
      <div className="flex flex-col gap-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-dojo-text-primary">{FREQUENCY.title}</h2>
          <p className="mt-2 text-sm text-dojo-text-muted">{FREQUENCY.subtitle}</p>
        </div>
        <div className="flex flex-col gap-3">
          {FREQUENCY_OPTIONS.map((opt) => {
            const selected = state.dailyGoalMinutes === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  dispatch({ type: 'SET_DAILY_GOAL_MINUTES', payload: opt.value });
                  dispatch({ type: 'COMPLETE_STEP', payload: PERSONALIZING.key });
                  goToStep(PERSONALIZING.key);
                }}
                className={`flex items-center gap-4 rounded-xl border p-4 text-left transition-all ${
                  selected
                    ? 'border-dojo-accent bg-dojo-accent/5 ring-2 ring-dojo-accent/20'
                    : 'border-dojo-border bg-dojo-surface hover:border-dojo-accent/50'
                }`}
              >
                <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                  selected ? 'border-dojo-accent bg-dojo-accent' : 'border-dojo-text-muted'
                }`}>
                  {selected && <CheckCircle2 className="h-3 w-3 text-white" />}
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-dojo-text-primary">{opt.label}</div>
                  {opt.description && (
                    <div className="text-sm text-dojo-text-muted">{opt.description}</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    ),
    [PERSONALIZING.key]: (
      <InterstitialStep
        title="Personalization in progress"
        loading={true}
        autoAdvance={true}
      />
    ),
    [PLAN_READY.key]: (
      <InterstitialStep
        title="Your personalized plan is ready!"
        autoAdvance={true}
        loading={saving}
      >
        <div className="flex flex-col items-center gap-2 text-sm text-dojo-text-muted">
          <p>Scenarios chosen for your level</p>
          <p>Preferred mode: {state.preferredMode || 'no preference'}</p>
          <p>Daily goal: {state.dailyGoalMinutes} minutes</p>
        </div>
      </InterstitialStep>
    ),
  };

  if (!step) return null;

  return (
    <OnboardingShell currentStep={step} exitHref="/">
      {stepContent[step] ?? (
        <div className="py-12 text-center">
          <p className="text-dojo-text-muted">Step not found</p>
        </div>
      )}
    </OnboardingShell>
  );
}
