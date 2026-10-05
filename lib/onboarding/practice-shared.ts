/**
 * Practice helpers the wizard UI can import.
 *
 * Must not import Drizzle / `src/db`. `OnboardingPractice` is a client
 * component, and a client bundle inlines non-NEXT_PUBLIC env as undefined —
 * which is how onboarding uniquely threw `DATABASE_URL is not defined`.
 */

export type PracticeSurface = 'voice' | 'avatar';

export interface PracticeSituation {
  id: number;
  title: string;
  context: string;
  learningGoals: string;
  skillLevel: string;
  characterName: string;
  characterRole: string;
  domainName: string;
}

export function practiceSurface(preferredMode: string): PracticeSurface {
  return preferredMode === 'avatar' ? 'avatar' : 'voice';
}

/** Text Chat is Voice with the transcript open, not a separate surface. */
export function practiceChatStartsOpen(preferredMode: string): boolean {
  return preferredMode === 'chat';
}
