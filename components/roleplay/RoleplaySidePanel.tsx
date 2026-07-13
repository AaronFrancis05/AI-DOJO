'use client';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Target, Lightbulb } from 'lucide-react';

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
}: RoleplaySidePanelProps) {
  return (
    <>
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
