'use client';

import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Target, Lightbulb, BookOpen, User, Flag } from 'lucide-react';
import { behaviorModeClass, skillLevelBadgeClass, type SkillLevel } from '@/lib/design-tokens';

interface GoalData {
  id: number;
  sequenceOrder: number;
  goalText: string;
  goalType: string;
}

interface VocabData {
  id: number;
  japanese: string;
  english: string;
}

export interface RoleplaySidePanelProps {
  goals: GoalData[];
  completedGoals: number[];
  vocabulary: VocabData[];
  situation: any;
  scenario: any;
  session: any;
  isActive: boolean;
  isCompleted: boolean;
  onPause: () => void;
  onEnd: () => void;
  onViewReport: () => void;
  domain?: any;
  character?: any;
  charName?: string;
  charRole?: string;
  charColor?: string;
}

export function RoleplaySidePanel({
  goals,
  completedGoals,
  vocabulary,
  situation,
  scenario,
  session,
  isActive,
  isCompleted,
  onPause,
  onEnd,
  onViewReport,
  domain,
  character,
  charName,
  charRole,
  charColor,
}: RoleplaySidePanelProps) {
  return (
    <>
      {/* ── Session Information summary ── */}
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <BookOpen className="h-4 w-4 text-dojo-accent" />
          <h3 className="text-xs font-semibold text-dojo-text-muted uppercase tracking-wider">Session Info</h3>
        </div>
        <div className="space-y-2.5 text-xs">
          {domain?.name && (
            <div className="flex items-center justify-between">
              <span className="text-dojo-text-muted">Domain</span>
              <span className="text-dojo-text-primary font-medium capitalize">{domain.name.replace('_', ' ')}</span>
            </div>
          )}
          {(situation?.title ?? scenario?.title) && (
            <div className="flex items-center justify-between">
              <span className="text-dojo-text-muted">Situation</span>
              <span className="text-dojo-text-primary font-medium text-right max-w-[60%] truncate">
                {situation?.title ?? scenario?.title}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-dojo-text-muted">Characters</span>
            <span className="flex items-center gap-1.5">
              <span
                className="flex h-5 w-5 items-center justify-center rounded-full text-[8px] font-bold text-white"
                style={{ backgroundColor: charColor ?? '#2D3BC5' }}
              >
                {(charName ?? 'A')[0]}
              </span>
              <span className="text-dojo-text-primary font-medium">{charName ?? 'AI'}</span>
              <span className="text-dojo-text-muted mx-0.5">+</span>
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-dojo-surface-raised border border-dojo-border text-[8px] text-dojo-text-muted">
                U
              </span>
            </span>
          </div>
          {session?.behaviorMode && (
            <div className="flex items-center justify-between">
              <span className="text-dojo-text-muted">Difficulty</span>
              <span className={`px-2 py-0.5 rounded-[--radius-pill] text-[10px] border ${
                behaviorModeClass[session.behaviorMode as keyof typeof behaviorModeClass] ?? behaviorModeClass.standard
              }`}>
                {session.behaviorMode === 'trouble' ? 'Trouble' : 'Standard'}
              </span>
            </div>
          )}
          {(situation?.skillLevel as SkillLevel) && (
            <div className="flex items-center justify-between">
              <span className="text-dojo-text-muted">Skill Level</span>
              <Badge variant={situation.skillLevel as SkillLevel}>{situation.skillLevel}</Badge>
            </div>
          )}
          {(situation?.learningGoals ?? scenario?.learningGoals) && (
            <div className="flex items-start gap-2 pt-1 border-t border-dojo-border">
              <Flag className="h-3.5 w-3.5 text-dojo-warning shrink-0 mt-0.5" />
              <span className="text-dojo-text-muted leading-relaxed">
                {situation?.learningGoals ?? scenario?.learningGoals}
              </span>
            </div>
          )}
        </div>
      </Card>

      {/* ── Goals ── */}
      <Card>
        <div className="flex items-center gap-2 mb-2">
          <Target className="h-4 w-4 text-dojo-accent" />
          <h3 className="text-xs font-semibold text-dojo-text-muted uppercase tracking-wider">Goals</h3>
        </div>
        {goals.length === 0 ? (
          <p className="text-xs text-dojo-text-muted">
            {situation?.learningGoals ?? scenario?.learningGoals ?? 'Practice the conversation naturally.'}
          </p>
        ) : (
          <ul className="space-y-2">
            {goals.map((goal) => {
              const done = completedGoals.includes(goal.sequenceOrder);
              return (
                <li key={goal.id} className="flex items-start gap-2">
                  <span
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                      done ? 'bg-dojo-success text-white' : 'border border-dojo-border text-dojo-text-muted'
                    }`}
                  >
                    {done ? '✓' : goal.sequenceOrder}
                  </span>
                  <span className={`text-xs ${done ? 'text-dojo-success line-through' : 'text-dojo-text-primary'}`}>
                    {goal.goalText}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {vocabulary.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 mb-2">
            <Lightbulb className="h-4 w-4 text-dojo-warning" />
            <h3 className="text-xs font-semibold text-dojo-text-muted uppercase tracking-wider">Key Vocabulary</h3>
          </div>
          <div className="space-y-2">
            {vocabulary.map((v) => (
              <div key={v.id} className="flex justify-between text-xs">
                <span className="text-dojo-text-primary font-medium">{v.japanese}</span>
                <span className="text-dojo-text-muted">{v.english}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="space-y-2">
        {isActive && (
          <Button variant="secondary" size="sm" className="w-full" onClick={onPause}>
            Pause Session
          </Button>
        )}
        {session?.status === 'paused' && (
          <Button variant="primary" size="sm" className="w-full" onClick={onPause}>
            Resume Session
          </Button>
        )}
        {isActive && (
          <Button variant="ghost" size="sm" className="w-full text-dojo-danger" onClick={onEnd}>
            End Session
          </Button>
        )}
        {isCompleted && (
          <Button variant="primary" size="sm" className="w-full" onClick={onViewReport}>
            View Report
          </Button>
        )}
      </div>
    </>
  );
}
