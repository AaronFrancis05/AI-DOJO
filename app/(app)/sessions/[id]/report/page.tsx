/* ───────────────────────────────────────────────
   Session Report — Full evaluation + conversation replay
   Fetches real session data from /api/sessions/[id]
   Shows scores, evaluation, and conversation transcript
   ─────────────────────────────────────────────── */

'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Avatar } from '@/components/ui/Avatar';
import { sessionHistory } from '@/lib/data/sessions';
import { ArrowLeft, ExternalLink } from 'lucide-react';

interface DataRecord {
  session: any;
  scenario: any;
  conversations: any[];
  evaluation: any | null;
  goalCompletions: any[];
}

export default function SessionReportPage() {
  const params = useParams();
  const sessionId = Number(params.id);

  const [data, setData] = useState<DataRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/sessions/${sessionId}`);
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Not found'); }
        const d = await res.json();
        setData(d);
      } catch (e: any) {
        setError(e.message);
        // Fallback: use mock
        const s = sessionHistory.find(x => x.id === sessionId);
        if (s) {
          setData({
            session: s,
            scenario: { title: s.scenarioTitle, context: '' },
            conversations: [],
            evaluation: null,
            goalCompletions: [],
          } as any);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [sessionId]);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-48 bg-dojo-border rounded" />
          <div className="h-4 w-72 bg-dojo-border rounded" />
          <div className="grid grid-cols-5 gap-4">
            {[1,2,3,4,5].map(i => <div key={i} className="h-24 bg-dojo-border rounded-xl" />)}
          </div>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="mx-auto max-w-4xl p-6 text-center">
        <p className="text-dojo-text-muted mb-2">Session not found</p>
        <p className="text-xs text-dojo-text-muted mb-4">{error}</p>
        <Link href="/sessions">
          <Button variant="secondary"><ArrowLeft className="h-4 w-4" /> Back to Sessions</Button>
        </Link>
      </div>
    );
  }

  if (!data) return null;

  const { session, scenario, conversations, evaluation, goalCompletions } = data;

  const scoreFields = [
    { label: 'Vocabulary', value: evaluation?.vocabularyScore ?? session.vocabularyScore, max: 30, color: 'accent' as const },
    { label: 'Grammar',    value: evaluation?.grammarScore ?? session.grammarScore,    max: 25, color: 'success' as const },
    { label: 'Fluency',    value: evaluation?.fluencyScore ?? session.fluencyScore,    max: 20, color: 'warning' as const },
    { label: 'Cultural',   value: evaluation?.culturalScore ?? session.culturalScore,  max: 15, color: 'accent' as const },
    { label: 'Task',       value: evaluation?.taskScore ?? session.taskScore,          max: 10, color: 'success' as const },
  ];

  const totalScore = scoreFields.reduce((s, x) => s + (x.value ?? 0), 0);
  const totalMax = scoreFields.reduce((s, x) => s + x.max, 0);
  const pct = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : null;

  const feedbackText = evaluation?.feedback ?? session.feedback;
  const scenarioTitle = scenario?.title ?? session.scenarioTitle ?? `Session #${session.id}`;
  const isActive = session.status === 'active';

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-6">
      {/* Header */}
      <div>
        <Link href="/sessions" className="inline-flex items-center gap-1 text-sm text-dojo-text-muted hover:text-dojo-text-primary mb-4">
          <ArrowLeft className="h-4 w-4" /> Back to Sessions
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-dojo-text-primary">{scenarioTitle}</h1>
            <p className="text-sm text-dojo-text-muted mt-1">
              {new Date(session.startedAt).toLocaleDateString()} · {session.totalTurns} turns
              {isActive ? ' · In Progress' : ' · Completed'}
              {session.completedAt && ` · ${new Date(session.completedAt).toLocaleDateString()}`}
            </p>
          </div>
          {scenario?.domain && (
            <Badge variant="default">{scenario.domain}</Badge>
          )}
        </div>
      </div>

      {/* Score Overview */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-dojo-text-muted uppercase tracking-wider">Score Breakdown</h3>
          {pct !== null && (
            <span className="text-2xl font-bold text-dojo-text-primary">{pct}%</span>
          )}
        </div>
        <div className="space-y-3">
          {scoreFields.map(sf => (
            <div key={sf.label}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-dojo-text-primary">{sf.label}</span>
                <span className="text-dojo-text-muted">{sf.value ?? '-'}/{sf.max}</span>
              </div>
              <ProgressBar value={sf.value ?? 0} max={sf.max} color={sf.color} size="sm" />
            </div>
          ))}
        </div>
      </Card>

      {/* Feedback */}
      {feedbackText && (
        <Card>
          <h3 className="text-sm font-semibold text-dojo-text-muted uppercase tracking-wider mb-3">AI Sensei Feedback</h3>
          <p className="text-sm text-dojo-text-primary whitespace-pre-wrap leading-relaxed">{feedbackText}</p>
        </Card>
      )}

      {/* Goal Completions */}
      {goalCompletions?.length > 0 && (
        <Card>
          <h3 className="text-sm font-semibold text-dojo-text-muted uppercase tracking-wider mb-3">Goals</h3>
          <div className="space-y-2">
            {goalCompletions.map((gc: any, i: number) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold
                  ${gc.achieved ?? true ? 'bg-dojo-success text-white' : 'border border-dojo-border text-dojo-text-muted'}`}>
                  {gc.achieved ?? true ? '✓' : i + 1}
                </span>
                <span className={gc.achieved ?? true ? 'text-dojo-text-primary' : 'text-dojo-text-muted'}>
                  {gc.goalText ?? gc.goal_type}
                </span>
                {gc.goalType && (
                  <Badge variant="default" className="ml-auto">{gc.goalType}</Badge>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Conversation */}
      {conversations?.length > 0 && (
        <Card>
          <h3 className="text-sm font-semibold text-dojo-text-muted uppercase tracking-wider mb-4">Conversation</h3>
          <div className="space-y-4">
            {conversations
              .sort((a: any, b: any) => (a.turnNo ?? 0) - (b.turnNo ?? 0))
              .map((msg: any, i: number) => {
                const isUser = msg.speaker === 'user';
                return (
                  <div key={i} className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
                    <Avatar name={isUser ? 'You' : (scenario?.aiCharacterName ?? 'AI')}
                      color={isUser ? '#2D3BC5' : '#D14343'} size="sm" />
                    <div className={`max-w-[75%] ${isUser ? '' : ''}`}>
                      {!isUser && (
                        <p className="text-[11px] text-dojo-text-muted mb-1">
                          {scenario?.aiCharacterName ?? 'AI'}
                          {msg.emotionTone && <span> · {msg.emotionTone}</span>}
                        </p>
                      )}
                      <div className={`rounded-2xl px-4 py-3 ${
                        isUser
                          ? 'rounded-br-none bg-dojo-accent'
                          : 'rounded-tl-none bg-dojo-surface-raised border border-dojo-border'
                      }`}>
                        {msg.messageJp && (
                          <p className={`text-sm font-medium ${isUser ? 'text-white' : 'text-dojo-text-primary'}`}>
                            {msg.messageJp}
                          </p>
                        )}
                        {msg.messageRomaji && (
                          <p className={`mt-1 text-xs italic ${isUser ? 'text-white/70' : 'text-dojo-text-muted'}`}>
                            {msg.messageRomaji}
                          </p>
                        )}
                        {msg.messageEn && (
                          <p className={`text-xs ${isUser ? 'text-white/60' : 'text-dojo-text-muted'}`}>
                            {msg.messageEn}
                          </p>
                        )}
                      </div>
                      {msg.gestureHint && (
                        <span className="mt-1 inline-flex items-center gap-1 text-[10px] text-dojo-text-muted italic">
                          🎭 {msg.gestureHint}
                        </span>
                      )}
                      {/* Corrections inline */}
                      {msg.corrections?.length > 0 && (
                        <div className="mt-1 space-y-1">
                          {msg.corrections.map((c: any, j: number) => (
                            <div key={j} className="rounded-lg bg-dojo-warning/10 border border-dojo-warning/30 px-3 py-2 text-xs">
                              <Badge variant="accent" className="mb-1">{c.correctionType}</Badge>
                              <p className="text-dojo-text-primary">
                                <span className="line-through text-dojo-danger">{c.originalText}</span>
                                {' → '}
                                <span className="text-dojo-success font-medium">{c.correctedText}</span>
                              </p>
                              <p className="text-dojo-text-muted mt-0.5">{c.explanation}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </Card>
      )}

      {/* Scenario Info */}
      {scenario && (
        <div className="text-center text-xs text-dojo-text-muted">
          {scenario.aiCharacterName && <span>AI: {scenario.aiCharacterName} ({scenario.aiCharacterRole})</span>}
          {scenario.userCharacterName && <span className="ml-4">You: {scenario.userCharacterName}</span>}
          {scenario.difficulty && <span className="ml-4">Difficulty: {scenario.difficulty}</span>}
        </div>
      )}
    </div>
  );
}
