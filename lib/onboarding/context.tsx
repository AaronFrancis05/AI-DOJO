'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
  type ReactNode,
  type Dispatch,
} from 'react';
import { loadTryoutParams, sanitizeLanguageCode } from '@/lib/tryout/guest-params';
import { DEFAULT_TARGET_LANGUAGE } from '@/lib/language';

export const ONBOARDING_STORAGE_KEY = 'ai-dojo:onboarding';

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

export type OnboardingAction =
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

export const initialOnboardingState: OnboardingState = {
  level: '',
  learningGoal: '',
  preferredDomainId: null,
  preferredDomainName: '',
  preferredMode: '',
  ageRange: '',
  targetLanguage: DEFAULT_TARGET_LANGUAGE,
  nativeLanguage: 'en',
  dailyGoalMinutes: 30,
  completedSteps: [],
};

/** Domain ids must be positive numbers — JSON and form values sometimes arrive as strings. */
export function coerceDomainId(value: unknown): number | null {
  const id = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(id) && id > 0 ? id : null;
}

/**
 * Restore fills blanks left by a remount. In-memory answers from this sitting
 * win, so a HYDRATE that lands after the learner has already clicked does not
 * wipe the domain they just picked.
 */
export function mergeOnboardingState(
  restored: OnboardingState,
  current: OnboardingState,
): OnboardingState {
  const initial = initialOnboardingState;
  return {
    level: current.level || restored.level,
    learningGoal: current.learningGoal || restored.learningGoal,
    preferredDomainId: current.preferredDomainId ?? restored.preferredDomainId,
    preferredDomainName: current.preferredDomainName || restored.preferredDomainName,
    preferredMode: current.preferredMode !== initial.preferredMode ? current.preferredMode : restored.preferredMode,
    ageRange: current.ageRange || restored.ageRange,
    targetLanguage: current.targetLanguage !== initial.targetLanguage ? current.targetLanguage : restored.targetLanguage,
    nativeLanguage: current.nativeLanguage !== initial.nativeLanguage ? current.nativeLanguage : restored.nativeLanguage,
    dailyGoalMinutes: current.dailyGoalMinutes !== initial.dailyGoalMinutes ? current.dailyGoalMinutes : restored.dailyGoalMinutes,
    completedSteps: [...new Set([...restored.completedSteps, ...current.completedSteps])],
  };
}

export function onboardingReducer(state: OnboardingState, action: OnboardingAction): OnboardingState {
  switch (action.type) {
    case 'SET_LEVEL':
      return { ...state, level: action.payload };
    case 'SET_LEARNING_GOAL':
      return { ...state, learningGoal: action.payload };
    case 'SET_PREFERRED_DOMAIN':
      return {
        ...state,
        preferredDomainId: coerceDomainId(action.payload.id),
        preferredDomainName: action.payload.name,
      };
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
      return mergeOnboardingState(action.payload, state);
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
  dispatch: Dispatch<OnboardingAction>;
  /** False until sessionStorage (or its absence) has been applied. */
  hydrated: boolean;
}

const OnboardingContext = createContext<OnboardingContextType | null>(null);

/**
 * The language pair a guest already chose in tryout, so the target/native
 * steps arrive pre-selected instead of asking a question they have just
 * answered.
 *
 * Read from the URL first (a shared link can still carry the pair) and then
 * from the tryout's own sessionStorage entry, which covers a learner who
 * signed up in the same tab after the preview.
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

  const targetLanguage = sanitizeLanguageCode(fromQuery.targetLanguage) ?? sanitizeLanguageCode(saved?.targetLanguage);
  const nativeLanguage = sanitizeLanguageCode(fromQuery.nativeLanguage) ?? sanitizeLanguageCode(saved?.nativeLanguage);

  return {
    ...(targetLanguage ? { targetLanguage } : {}),
    ...(nativeLanguage ? { nativeLanguage } : {}),
  };
}

function normalizeLoadedState(parsed: Partial<OnboardingState>): OnboardingState {
  return {
    ...initialOnboardingState,
    ...parsed,
    preferredDomainId: coerceDomainId(parsed.preferredDomainId),
    completedSteps: Array.isArray(parsed.completedSteps) ? parsed.completedSteps.filter((s) => typeof s === 'string') : [],
    ...prefillFromTryout(),
  };
}

/**
 * Onboarding answers survived only in memory, so a refresh threw away every
 * answer before any of them had been saved.
 */
export function loadPersistedOnboardingState(): OnboardingState {
  const base = normalizeLoadedState({});
  if (typeof window === 'undefined') return base;
  try {
    const raw = window.sessionStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<OnboardingState>;
    // Spread order matters: a pair carried on the URL is the learner's most
    // recent choice and outranks whatever an earlier pass persisted.
    return normalizeLoadedState(parsed);
  } catch {
    return base;
  }
}

export function persistOnboardingState(state: OnboardingState): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // sessionStorage unavailable — answers stay in memory, as before
  }
}

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [state, rawDispatch] = useReducer(onboardingReducer, initialOnboardingState);
  const [hydrated, setHydrated] = useState(false);
  const stateRef = useRef(initialOnboardingState);
  const readyToPersist = useRef(false);

  // Persist inside dispatch so a click + router.push cannot beat a useEffect
  // and lose the domain on the next layout remount.
  const dispatch = useCallback((action: OnboardingAction) => {
    const next = onboardingReducer(stateRef.current, action);
    stateRef.current = next;
    rawDispatch(action);
    if (action.type === 'HYDRATE' || readyToPersist.current) {
      persistOnboardingState(next);
    }
  }, []);

  // Restored after mount rather than in a lazy initializer: the server render
  // has no sessionStorage, so seeding the first client render from it would
  // be a hydration mismatch on every already-answered step.
  useEffect(() => {
    const restored = loadPersistedOnboardingState();
    readyToPersist.current = true;
    dispatch({ type: 'HYDRATE', payload: restored });
    // External store the server cannot see — same one-shot restore as
    // OnboardingShell's mounted flag, not a reaction to other React state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true);
  }, [dispatch]);

  return (
    <OnboardingContext.Provider value={{ state, dispatch, hydrated }}>
      {children}
    </OnboardingContext.Provider>
  );
}

/** Clears the persisted wizard state once its answers have reached the server. */
export function clearPersistedOnboarding(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(ONBOARDING_STORAGE_KEY);
  } catch {
    // nothing to do
  }
}

export function useOnboarding(): OnboardingContextType {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding must be used within OnboardingProvider');
  return ctx;
}
