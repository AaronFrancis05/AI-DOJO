'use client';

import { createContext, useContext, useEffect, useReducer, useRef, type ReactNode, type Dispatch } from 'react';
import { loadTryoutParams } from '@/lib/tryout/guest-params';

const STORAGE_KEY = 'ai-dojo:onboarding';
const RESUME_KEY = 'ai-dojo:onboarding-resume';

export interface OnboardingState {
  level: string;
  learningGoal: string;
  preferredDomainId: number | null;
  preferredDomainName: string;
  preferredMode: string;
  ageRange: string;
  targetLanguage: string;
  nativeLanguage: string;
  dailyGoalMinutes: number;
  completedSteps: string[];
}

type Action =
  | { type: 'SET_LEVEL'; payload: string }
  | { type: 'SET_LEARNING_GOAL'; payload: string }
  | { type: 'SET_PREFERRED_DOMAIN'; payload: { id: number; name: string } }
  | { type: 'SET_PREFERRED_MODE'; payload: string }
  | { type: 'SET_AGE_RANGE'; payload: string }
  | { type: 'SET_TARGET_LANGUAGE'; payload: string }
  | { type: 'SET_NATIVE_LANGUAGE'; payload: string }
  | { type: 'SET_DAILY_GOAL_MINUTES'; payload: number }
  | { type: 'COMPLETE_STEP'; payload: string }
  | { type: 'HYDRATE'; payload: OnboardingState };

const initialState: OnboardingState = {
  level: '',
  learningGoal: '',
  preferredDomainId: null,
  preferredDomainName: '',
  preferredMode: '',
  ageRange: '',
  targetLanguage: 'ja',
  nativeLanguage: 'en',
  dailyGoalMinutes: 30,
  completedSteps: [],
};

function onboardingReducer(state: OnboardingState, action: Action): OnboardingState {
  switch (action.type) {
    case 'SET_LEVEL':
      return { ...state, level: action.payload };
    case 'SET_LEARNING_GOAL':
      return { ...state, learningGoal: action.payload };
    case 'SET_PREFERRED_DOMAIN':
      return { ...state, preferredDomainId: action.payload.id, preferredDomainName: action.payload.name };
    case 'SET_PREFERRED_MODE':
      return { ...state, preferredMode: action.payload };
    case 'SET_AGE_RANGE':
      return { ...state, ageRange: action.payload };
    case 'SET_TARGET_LANGUAGE':
      return { ...state, targetLanguage: action.payload };
    case 'SET_NATIVE_LANGUAGE':
      return { ...state, nativeLanguage: action.payload };
    case 'SET_DAILY_GOAL_MINUTES':
      return { ...state, dailyGoalMinutes: action.payload };
    case 'HYDRATE':
      return action.payload;
    case 'COMPLETE_STEP':
      return {
        ...state,
        completedSteps: state.completedSteps.includes(action.payload)
          ? state.completedSteps
          : [...state.completedSteps, action.payload],
      };
    default:
      return state;
  }
}

interface OnboardingContextType {
  state: OnboardingState;
  dispatch: Dispatch<Action>;
}

const OnboardingContext = createContext<OnboardingContextType | null>(null);

/**
 * The language pair a guest already chose, so the target/native steps arrive
 * pre-selected instead of asking a question they have just answered.
 *
 * Read from the URL first (the tryout completion screen carries the pair) and
 * then from the tryout's own sessionStorage entry, which covers a learner who
 * reached onboarding some other way in the same tab.
 *
 * `window.location.search` rather than `useSearchParams`, because the
 * provider is rendered from a layout: a `useSearchParams` there opts the
 * whole subtree out of static rendering unless it is wrapped in its own
 * Suspense boundary.
 */
function prefillFromTryout(): Partial<OnboardingState> {
  if (typeof window === 'undefined') return {};
  const query = new URLSearchParams(window.location.search);
  const fromQuery = {
    targetLanguage: query.get('targetLanguage'),
    nativeLanguage: query.get('nativeLanguage'),
  };
  const saved = loadTryoutParams();

  const targetLanguage = fromQuery.targetLanguage ?? saved?.targetLanguage;
  const nativeLanguage = fromQuery.nativeLanguage ?? saved?.nativeLanguage;

  return {
    ...(targetLanguage ? { targetLanguage } : {}),
    ...(nativeLanguage ? { nativeLanguage } : {}),
  };
}

/**
 * Onboarding answers survived only in memory, so a refresh — or the redirect
 * bounce through an OAuth provider on the very last step — threw away every
 * answer before any of them had been saved.
 */
function loadPersistedState(): OnboardingState {
  const base = { ...initialState, ...prefillFromTryout() };
  if (typeof window === 'undefined') return base;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<OnboardingState>;
    // Spread order matters: a pair carried on the URL is the learner's most
    // recent choice and outranks whatever an earlier pass persisted.
    return { ...initialState, ...parsed, ...prefillFromTryout() };
  } catch {
    return base;
  }
}

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(onboardingReducer, initialState);
  const hydrated = useRef(false);

  // Restored after mount rather than in a lazy initializer: the server render
  // has no sessionStorage, so seeding the first client render from it would
  // be a hydration mismatch on every already-answered step.
  useEffect(() => {
    dispatch({ type: 'HYDRATE', payload: loadPersistedState() });
    hydrated.current = true;
  }, []);

  useEffect(() => {
    // Writing before the restore lands would overwrite the saved answers
    // with the empty initial state.
    if (!hydrated.current) return;
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // sessionStorage unavailable — answers stay in memory, as before
    }
  }, [state]);

  return (
    <OnboardingContext.Provider value={{ state, dispatch }}>
      {children}
    </OnboardingContext.Provider>
  );
}

/** Clears the persisted wizard state once its answers have reached the server. */
export function clearPersistedOnboarding(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
    window.sessionStorage.removeItem(RESUME_KEY);
  } catch {
    // nothing to do
  }
}

/**
 * Marks that the learner left the wizard for an OAuth provider from its last
 * step. The provider callback can only send a brand-new signup to
 * `/onboarding`, which is the first step — without this flag a learner who
 * signs up with Google on the account step walks the whole wizard a second
 * time, answers pre-filled but every click repeated.
 */
export function markOnboardingResume(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(RESUME_KEY, '1');
  } catch {
    // the learner re-walks the (pre-filled) wizard — degraded, not broken
  }
}

/** Reads and consumes the resume flag. */
export function takeOnboardingResume(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const value = window.sessionStorage.getItem(RESUME_KEY);
    if (value) window.sessionStorage.removeItem(RESUME_KEY);
    return Boolean(value);
  } catch {
    return false;
  }
}

export function useOnboarding(): OnboardingContextType {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding must be used within OnboardingProvider');
  return ctx;
}
