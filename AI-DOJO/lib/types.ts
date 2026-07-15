import { SkillLevel } from './design-tokens';

export interface SessionRecord {
  id: number;
  userId: string;
  scenarioId: number;
  situationId: number | null;
  characterId: number | null;
  behaviorMode: string;
  sessionNumber: number;
  status: string;
  totalTurns: number;
  vocabularyScore: number | null;
  grammarScore: number | null;
  fluencyScore: number | null;
  culturalScore: number | null;
  taskScore: number | null;
  feedback: string | null;
  startedAt: string;
  completedAt: string | null;
  scenarioTitle?: string;
}

export interface Domain {
  id: number;
  slug: string;
  name: string;
  description: string;
  icon: string;
  heroGradientFrom: string;
  heroGradientTo: string;
  imageUrl?: string | null;
  situationCount: number;
  displayOrder: number;
  createdAt: string;
}

export interface Situation {
  id: number;
  domainId: number;
  domainSlug?: string;
  title: string;
  context: string;
  skillLevel: SkillLevel;
  behaviorMode: string;
  learningGoals: string;
  focusPills: string | string[];
  displayOrder: number;
  createdAt: string;
  counterpartRole?: string;
}
