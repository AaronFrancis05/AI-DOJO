'use client';

import { Flag } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { behaviorModeClass, type SkillLevel } from '@/lib/design-tokens';
import { getTargetLangConfig, getNativeLangName } from '@/lib/language';

/* ── Types (mirrors page.tsx) ──────────────────── */
interface GoalData  { id: number; sequenceOrder: number; goalText: string; goalType: string; }

interface SessionInfoPanelProps {
  domain: any;
  situation: any;
  scenario: any;
  session: any;
  character: any;
  charName: string;
  charColor: string;
  goals: GoalData[];
  completedGoals: number[];
  isActive: boolean;
  isCompleted: boolean;
  onEnd: () => void;
  onViewReport: () => void;
  targetLanguage?: string;
  nativeLanguage?: string;
  correctionCount?: number;
}

export function SessionInfoPanel({
  domain, situation, scenario, session, character,
  charName, charColor, goals, completedGoals, isActive, isCompleted,
  onEnd, onViewReport, targetLanguage, nativeLanguage, correctionCount,
}: SessionInfoPanelProps) {
  const primaryGoal =
    situation?.learningGoals ?? scenario?.learningGoals ?? '';
  const targetName = targetLanguage ? getTargetLangConfig(targetLanguage).name : '';
  const nativeName = nativeLanguage ? getNativeLangName(nativeLanguage) : '';

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 py-4 border-b border-dojo-border shrink-0">
        <p className="text-sm font-semibold text-dojo-text-primary">Session Information</p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-0">
        <div className="space-y-3 text-sm">
          {domain?.name && (
            <div className="flex items-start justify-between gap-3">
              <span className="text-dojo-text-muted shrink-0">Scenario</span>
              <span className="text-dojo-text-primary font-medium text-right capitalize">
                {domain.name.replace('_', ' ')}
              </span>
            </div>
          )}
          {(situation?.title ?? scenario?.title) && (
            <div className="flex items-start justify-between gap-3">
              <span className="text-dojo-text-muted shrink-0">Situation</span>
              <span className="text-dojo-text-primary font-medium text-right">
                {situation?.title ?? scenario?.title}
              </span>
            </div>
          )}

          {targetName && (
            <div className="flex items-start justify-between gap-3">
              <span className="text-dojo-text-muted shrink-0">Target</span>
              <span className="text-dojo-text-primary font-medium text-right">{targetName}</span>
            </div>
          )}

          {nativeName && (
            <div className="flex items-start justify-between gap-3">
              <span className="text-dojo-text-muted shrink-0">Native</span>
              <span className="text-dojo-text-primary font-medium text-right">{nativeName}</span>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <span className="text-dojo-text-muted shrink-0">Characters</span>
            <div className="flex items-center gap-1.5">
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full ring-2 ring-dojo-border overflow-hidden"
                style={{ backgroundColor: charColor }}
              >
                <img src={`https://api.dicebear.com/7.x/bottts/svg?seed=${charName}&backgroundColor=${charColor.replace('#','')}`} alt={charName} className="h-full w-full object-cover" />
              </span>
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-dojo-surface-raised border border-dojo-border text-[9px] font-medium text-dojo-text-muted">
                U
              </span>
            </div>
          </div>

          {session?.behaviorMode && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-dojo-text-muted shrink-0">Difficulty</span>
              <span
                className={`px-2.5 py-0.5 rounded-[--radius-pill] text-[11px] font-medium border ${
                  behaviorModeClass[session.behaviorMode as keyof typeof behaviorModeClass] ??
                  behaviorModeClass.standard
                }`}
              >
                {session.behaviorMode === 'trouble' ? 'Trouble' : 'Standard'}
              </span>
            </div>
          )}

          {situation?.skillLevel && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-dojo-text-muted shrink-0">Skill Level</span>
              <Badge variant={situation.skillLevel as SkillLevel}>{situation.skillLevel}</Badge>
            </div>
          )}
        </div>

        {primaryGoal && (
          <div className="mt-4 pt-4 border-t border-dojo-border">
            <div className="flex items-start gap-2">
              <Flag className="h-3.5 w-3.5 text-dojo-warning shrink-0 mt-0.5" />
              <p className="text-xs text-dojo-text-muted leading-relaxed">{primaryGoal}</p>
            </div>
          </div>
        )}

        {goals.length > 0 && (
          <div className="mt-4 pt-4 border-t border-dojo-border space-y-2">
            {goals.map((goal) => {
              const done = completedGoals.includes(goal.sequenceOrder);
              return (
                <div key={goal.id} className="flex items-start gap-2">
                  <span
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                      done ? 'bg-dojo-success text-white' : 'border border-dojo-border text-dojo-text-muted'
                    }`}
                  >
                    {done ? '✓' : goal.sequenceOrder}
                  </span>
                  <span className={`text-[11px] leading-relaxed ${done ? 'text-dojo-success line-through' : 'text-dojo-text-primary'}`}>
                    {goal.goalText}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {correctionCount !== undefined && correctionCount > 0 && (
          <div className="mt-4 pt-4 border-t border-dojo-border">
            <div className="flex items-center gap-2">
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-dojo-warning/20 text-[9px] font-bold text-dojo-warning">!</span>
              <span className="text-[11px] text-dojo-text-muted">{correctionCount} tip{correctionCount !== 1 ? 's' : ''} this session</span>
            </div>
          </div>
        )}
      </div>

      <div className="px-5 py-4 border-t border-dojo-border space-y-2 shrink-0">
        {isActive && (
          <button
            onClick={onEnd}
            className="w-full rounded-[--radius-md] border border-dojo-danger/40 bg-dojo-danger/10 py-2 text-sm font-medium text-dojo-danger hover:bg-dojo-danger/20 transition-colors"
          >
            End Session
          </button>
        )}
        {isCompleted && (
          <button
            onClick={onViewReport}
            className="w-full rounded-[--radius-md] bg-dojo-accent py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
          >
            View Report
          </button>
        )}
      </div>
    </div>
  );
}
