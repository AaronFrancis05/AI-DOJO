'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  useOnboarding,
  clearPersistedOnboarding,
  markOnboardingResume,
  takeOnboardingResume,
} from '@/lib/onboarding/context';
import {
  ONBOARDING_STEPS, LEVEL_OPTIONS, GOAL_OPTIONS,
  MODE_OPTIONS, AGE_OPTIONS, FREQUENCY_OPTIONS,
} from '@/lib/onboarding/steps';
import { SingleSelectStep, InterstitialStep, OnboardingShell } from '@/components/onboarding';
import { LanguageSelectionPanel } from '@/components/ui/LanguageSelectionPanel';
import { useLanguageCatalog } from '@/lib/language-context';
import { Sparkles, MessageSquare, Mic, User, BookOpen, Clock, CheckCircle2, LoaderIcon } from 'lucide-react';
import { authClient } from '@/lib/auth/client';
import { getAuthErrorMessage } from '@/lib/auth/errors';

type StepComponent = React.ReactNode;

export default function OnboardingStepPage() {
  const params = useParams();
  const router = useRouter();
  const step = params.step as string;
  const { state, dispatch } = useOnboarding();
  const catalog = useLanguageCatalog();
  const [modeValue, setModeValue] = useState(state.preferredMode);
  const [saving, setSaving] = useState(false);
  const [accountCreated, setAccountCreated] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [dbDomains, setDbDomains] = useState<{ id: number; name: string; icon: string; description: string }[]>([]);
  const [loadingDomains, setLoadingDomains] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(step === 'account');
  const autoAdvanceTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    return () => autoAdvanceTimers.current.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (step === 'domain' && dbDomains.length === 0 && !loadingDomains) {
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
   * The route enrols them into a course as part of finishing onboarding, so
   * the destination is that course rather than /home — landing on a dashboard
   * with no path to follow was the whole gap. It falls back to /home when no
   * course could be resolved (an install with no active courses).
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
      if (data?.courseSlug) {
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
    if (step === 'account') {
      authClient.getSession().then(({ data }) => {
        if (data?.user) {
          setSaving(true);
          setAccountCreated(true);
          submitOnboarding();
        } else {
          setCheckingAuth(false);
        }
      });
    }
  }, [step, submitOnboarding]);

  useEffect(() => {
    if (step === 'personalizing') {
      const t = setTimeout(() => router.push('/onboarding/plan-ready'), 2000);
      autoAdvanceTimers.current.push(t);
      return () => clearTimeout(t);
    }
  }, [step, router]);

  useEffect(() => {
    if (step === 'plan-ready') {
      const t = setTimeout(() => router.push('/onboarding/account'), 2500);
      autoAdvanceTimers.current.push(t);
      return () => clearTimeout(t);
    }
  }, [step, router]);

  const goToStep = useCallback((key: string) => {
    router.push(`/onboarding/${key}`);
  }, [router]);

  const selectAndAdvance = useCallback((type: string, payload: unknown, nextStep: string) => {
    dispatch({ type: type as never, payload: payload as never });
    dispatch({ type: 'COMPLETE_STEP', payload: nextStep });
    goToStep(nextStep);
  }, [dispatch, goToStep]);

  const handleEmailSignup = async () => {
    setError('');
    setSaving(true);
    try {
      const { error: authError } = await authClient.signUp.email({ email, password, name });
      if (authError) {
        setError(
          getAuthErrorMessage(authError, 'Something went wrong. Please try again.', 'sign-up'),
        );
        return;
      }
      setAccountCreated(true);
      await submitOnboarding();
    } catch (err) {
      setError(getAuthErrorMessage(err, 'Network error. Please try again.', 'sign-up'));
    } finally {
      setSaving(false);
    }
  };

  const handleGoogleAuth = async () => {
    markOnboardingResume();
    window.location.href = '/api/auth/google/init';
  };

  // The OAuth callback can only send a new signup to the first step. If the
  // learner left from the account step, put them back on it — their answers
  // are still in sessionStorage and are about to be submitted.
  useEffect(() => {
    if (step !== 'level') return;
    if (takeOnboardingResume()) router.replace('/onboarding/account');
  }, [step, router]);

  const stepContent: Record<string, StepComponent> = {
    'level': (
      <SingleSelectStep
        options={LEVEL_OPTIONS}
        value={state.level}
        onChange={(v) => selectAndAdvance('SET_LEVEL', v, 'social-proof')}
        title={ONBOARDING_STEPS[0].title}
        subtitle={ONBOARDING_STEPS[0].subtitle}
      />
    ),
    'social-proof': (
      <InterstitialStep
        title="You're in good company"
        onContinue={() => goToStep('goal')}
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
    'goal': (
      <SingleSelectStep
        options={GOAL_OPTIONS}
        value={state.learningGoal}
        onChange={(v) => selectAndAdvance('SET_LEARNING_GOAL', v, 'transition-1')}
        title={ONBOARDING_STEPS[2].title}
        subtitle={ONBOARDING_STEPS[2].subtitle}
      />
    ),
    'transition-1': (
      <InterstitialStep
        title="Great! Let's get you started!"
        onContinue={() => goToStep('domain')}
      />
    ),
    'domain': (
      <div className="flex flex-col gap-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-dojo-text-primary">{ONBOARDING_STEPS[4].title}</h2>
          <p className="mt-2 text-sm text-dojo-text-muted">{ONBOARDING_STEPS[4].subtitle}</p>
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
                    dispatch({ type: 'COMPLETE_STEP', payload: 'mode' });
                    goToStep('mode');
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
    'mode': (
      <SingleSelectStep
        options={MODE_OPTIONS}
        value={state.preferredMode}
        onChange={(v) => selectAndAdvance('SET_PREFERRED_MODE', v, 'transition-2')}
        title={ONBOARDING_STEPS[5].title}
        subtitle={ONBOARDING_STEPS[5].subtitle}
      />
    ),
    'transition-2': (
      <InterstitialStep
        title="You're almost set up!"
        onContinue={() => goToStep('age')}
      />
    ),
    'age': (
      <SingleSelectStep
        options={AGE_OPTIONS}
        value={state.ageRange}
        onChange={(v) => selectAndAdvance('SET_AGE_RANGE', v, 'target-language')}
        title={ONBOARDING_STEPS[7].title}
        subtitle={ONBOARDING_STEPS[7].subtitle}
        skippable={true}
        onSkip={() => goToStep('target-language')}
      />
    ),
    'target-language': (
      <div className="flex flex-col gap-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-dojo-text-primary">{ONBOARDING_STEPS[8].title}</h2>
          <p className="mt-2 text-sm text-dojo-text-muted">{ONBOARDING_STEPS[8].subtitle}</p>
        </div>
        <LanguageSelectionPanel
          value={state.targetLanguage}
          onSelect={(code) => {
            dispatch({ type: 'SET_TARGET_LANGUAGE', payload: code });
            dispatch({ type: 'COMPLETE_STEP', payload: 'native-language' });
            goToStep('native-language');
          }}
        />
      </div>
    ),
    'native-language': (
      <div className="flex flex-col gap-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-dojo-text-primary">{ONBOARDING_STEPS[9].title}</h2>
          <p className="mt-2 text-sm text-dojo-text-muted">{ONBOARDING_STEPS[9].subtitle}</p>
        </div>
        <LanguageSelectionPanel
          value={state.nativeLanguage}
          options={catalog.native}
          searchPlaceholder="Search your native language..."
          onSelect={(code) => {
            dispatch({ type: 'SET_NATIVE_LANGUAGE', payload: code });
            dispatch({ type: 'COMPLETE_STEP', payload: 'frequency' });
            goToStep('frequency');
          }}
        />
      </div>
    ),
    'frequency': (
      <div className="flex flex-col gap-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-dojo-text-primary">{ONBOARDING_STEPS[10].title}</h2>
          <p className="mt-2 text-sm text-dojo-text-muted">{ONBOARDING_STEPS[10].subtitle}</p>
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
                  dispatch({ type: 'COMPLETE_STEP', payload: 'personalizing' });
                  goToStep('personalizing');
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
    'personalizing': (
      <InterstitialStep
        title="Personalization in progress"
        loading={true}
        autoAdvance={true}
      />
    ),
    'plan-ready': (
      <InterstitialStep
        title="Your personalized plan is ready!"
        autoAdvance={true}
      >
        <div className="flex flex-col items-center gap-2 text-sm text-dojo-text-muted">
          <p>Scenarios chosen for your level</p>
          <p>Preferred mode: {state.preferredMode || 'no preference'}</p>
          <p>Daily goal: {state.dailyGoalMinutes} minutes</p>
        </div>
      </InterstitialStep>
    ),
    'account': (
      <div className="flex flex-col gap-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-dojo-text-primary">{ONBOARDING_STEPS[13].title}</h2>
          <p className="mt-2 text-sm text-dojo-text-muted">{ONBOARDING_STEPS[13].subtitle}</p>
        </div>

        {accountCreated ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <CheckCircle2 className="h-12 w-12 text-dojo-success" />
            <p className="text-lg font-semibold text-dojo-text-primary">Account created!</p>
            <p className="text-sm text-dojo-text-muted">Redirecting to your dashboard...</p>
          </div>
        ) : checkingAuth ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <LoaderIcon className="h-8 w-8 animate-spin text-dojo-accent" />
            <p className="text-sm text-dojo-text-muted">Checking your session...</p>
          </div>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); handleEmailSignup(); }} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-dojo-text-muted">Full name</label>
              <input
                type="text"
                placeholder="Alex Kim"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-lg border border-dojo-border bg-dojo-surface px-4 py-3 text-sm text-dojo-text-primary outline-none transition placeholder:text-dojo-text-muted/50 focus:border-dojo-accent focus:ring-2 focus:ring-dojo-accent/20"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-dojo-text-muted">Email address</label>
              <input
                type="email"
                placeholder="alex@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-lg border border-dojo-border bg-dojo-surface px-4 py-3 text-sm text-dojo-text-primary outline-none transition placeholder:text-dojo-text-muted/50 focus:border-dojo-accent focus:ring-2 focus:ring-dojo-accent/20"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-dojo-text-muted">Password</label>
              <input
                type="password"
                placeholder="Password (min 6 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full rounded-lg border border-dojo-border bg-dojo-surface px-4 py-3 text-sm text-dojo-text-primary outline-none transition placeholder:text-dojo-text-muted/50 focus:border-dojo-accent focus:ring-2 focus:ring-dojo-accent/20"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-dojo-danger/30 bg-dojo-danger/10 px-3 py-2.5 text-sm text-dojo-danger">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-dojo-accent py-3 font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {saving && <LoaderIcon className="h-4 w-4 animate-spin" />}
              {saving ? 'Creating account...' : 'Create Account'}
            </button>

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-dojo-border" />
              <span className="text-xs text-dojo-text-muted">or</span>
              <div className="h-px flex-1 bg-dojo-border" />
            </div>

            <button
              type="button"
              onClick={handleGoogleAuth}
              className="flex w-full items-center justify-center gap-3 rounded-lg border border-dojo-border bg-dojo-surface py-3 text-sm font-medium text-dojo-text-primary transition-colors hover:bg-dojo-surface-raised"
            >
              Continue with Google
            </button>
          </form>
        )}
      </div>
    ),
  };

  const stepConfig = ONBOARDING_STEPS.find(s => s.key === step);
  if (!step) return null;

  return (
    <OnboardingShell currentStep={step}>
      {stepContent[step] ?? (
        <div className="py-12 text-center">
          <p className="text-dojo-text-muted">Step not found</p>
        </div>
      )}
    </OnboardingShell>
  );
}
