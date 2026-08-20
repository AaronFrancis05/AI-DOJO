import { Compass, MessagesSquare, Signpost, Rocket, ClipboardCheck, Trophy, type LucideIcon } from 'lucide-react';

export type SessionPhaseKey = 'orientation' | 'icebreaker' | 'guided' | 'unguided' | 'evaluation' | 'completed';

export interface PhaseMeta {
  key: SessionPhaseKey;
  order: number;
  label: string;
  title: string;
  description: string;
  icon: LucideIcon;
  hex: string;
  badgeClass: string;
  glowClass: string;
  portraitSrc: string;
}

export const PHASE_ORDER: SessionPhaseKey[] = ['orientation', 'icebreaker', 'guided', 'unguided', 'evaluation', 'completed'];

export const PHASE_META: Record<SessionPhaseKey, PhaseMeta> = {
  orientation: {
    key: 'orientation',
    order: 1,
    label: 'Orientation',
    title: 'Orientation Phase',
    description: "Let's get you familiar with your journey.",
    icon: Compass,
    hex: '#0EA5E9',
    badgeClass: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
    glowClass: 'from-sky-500/25 via-sky-500/5 to-transparent',
    portraitSrc: '/characters/phase-orientation.png',
  },
  icebreaker: {
    key: 'icebreaker',
    order: 2,
    label: 'Icebreaker',
    title: 'Icebreaker Phase',
    description: "Let's break the ice and get comfortable together.",
    icon: MessagesSquare,
    hex: '#D946EF',
    badgeClass: 'bg-dojo-icebreaker/20 text-dojo-icebreaker border-dojo-icebreaker/30',
    glowClass: 'from-dojo-icebreaker/25 via-dojo-icebreaker/5 to-transparent',
    portraitSrc: '/characters/phase-icebreaker.png',
  },
  guided: {
    key: 'guided',
    order: 3,
    label: 'Guided Roleplay',
    title: 'Guided Phase',
    description: "I'll guide you step by step.",
    icon: Signpost,
    hex: '#16A34A',
    badgeClass: 'bg-dojo-success/20 text-dojo-success border-dojo-success/30',
    glowClass: 'from-dojo-success/25 via-dojo-success/5 to-transparent',
    portraitSrc: '/characters/phase-guided.png',
  },
  unguided: {
    key: 'unguided',
    order: 4,
    label: 'Free Practice',
    title: 'Unguided Phase',
    description: "Your turn! Show what you've learned.",
    icon: Rocket,
    hex: '#D97706',
    badgeClass: 'bg-dojo-warning/20 text-dojo-warning border-dojo-warning/30',
    glowClass: 'from-dojo-warning/25 via-dojo-warning/5 to-transparent',
    portraitSrc: '/characters/phase-unguided.png',
  },
  evaluation: {
    key: 'evaluation',
    order: 5,
    label: 'Evaluation',
    title: 'Evaluation Phase',
    description: "Let's see how you did.",
    icon: ClipboardCheck,
    hex: '#3B82F6',
    badgeClass: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    glowClass: 'from-blue-500/25 via-blue-500/5 to-transparent',
    portraitSrc: '/characters/phase-evaluation.png',
  },
  completed: {
    key: 'completed',
    order: 6,
    label: 'Complete',
    title: 'Lesson Complete!',
    description: 'You did amazing!',
    icon: Trophy,
    hex: '#F0A93B',
    badgeClass: 'bg-dojo-streak/20 text-dojo-streak border-dojo-streak/30',
    glowClass: 'from-dojo-streak/25 via-dojo-streak/5 to-transparent',
    portraitSrc: '/characters/phase-completed.png',
  },
};

export function getPhaseMeta(phase: string): PhaseMeta {
  return PHASE_META[phase as SessionPhaseKey] ?? PHASE_META.orientation;
}
