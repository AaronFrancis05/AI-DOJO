/* ───────────────────────────────────────────────
   AI DOJO — Design Tokens & Utility
   Sampled directly from mockup v4
   Use Tailwind CSS class names for styling;
   these exports provide runtime values when needed (e.g. inline style for gradients).
   ─────────────────────────────────────────────── */

export const colors = {
  canvas:        '#050B14',
  sidebar:       '#010A18',
  surface:       '#0B1526',
  surfaceRaised: '#111D33',
  border:        '#1C2A42',
  accent:        '#2D3BC5',
  accentSoft:    '#191359',
  success:       '#2FAE66',
  warning:       '#E3A939',
  danger:        '#D14343',
  streak:        '#F0A93B',
  textPrimary:   '#F4F4F8',
  textMuted:     '#8A93A8',
} as const;

export const radius = {
  sm:   8,
  md:   12,
  lg:   16,
  pill: 999,
} as const;

/* ── Tailwind class maps ───────────────────── */

export type SkillLevel = 'beginner' | 'intermediate' | 'advanced';
export type BehaviorMode = 'standard' | 'trouble';

export const skillLevelBadgeClass: Record<SkillLevel, string> = {
  beginner:     'bg-dojo-success text-white',
  intermediate: 'bg-dojo-warning text-black',
  advanced:     'bg-dojo-danger text-white',
};

export const skillLevelTextClass: Record<SkillLevel, string> = {
  beginner:     'text-dojo-success',
  intermediate: 'text-dojo-warning',
  advanced:     'text-dojo-danger',
};

export const behaviorModeClass = {
  standard: 'border-dojo-success text-dojo-success',
  trouble:  'border-dojo-danger text-dojo-danger',
} as const;

/* ── Utility ─────────────────────────────────── */

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
