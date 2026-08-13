'use client';

import { createContext, useContext, useReducer, type ReactNode, type Dispatch } from 'react';

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
  | { type: 'COMPLETE_STEP'; payload: string };

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

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(onboardingReducer, initialState);
  return (
    <OnboardingContext.Provider value={{ state, dispatch }}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding(): OnboardingContextType {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding must be used within OnboardingProvider');
  return ctx;
}
