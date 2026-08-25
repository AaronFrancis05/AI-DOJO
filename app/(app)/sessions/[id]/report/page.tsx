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
import { cleanDisplay } from '@/lib/roleplay/clean-display';
import { computeCompositeScore, PASSING_SCORE_THRESHOLD } from '@/lib/roleplay/phase-engine';
import { TUTORS_ENABLED } from '@/lib/tutors/config';
import { ArrowLeft, ExternalLink, Trophy, Target, Repeat2, RotateCcw, Users } from 'lucide-react';

interface DataRecord {
  session: any;
  scenario: any;
  conversations: any[];
  evaluation: any | null;
  goalCompletions: any[];
  goals?: any[];
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
        const res = await fetch(`/api/sessions/${sessionId}`, { credentials: 'include' });
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
            goals: [],
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

  const { session, scenario, conversations, evaluation, goalCompletions, goals } = data;

  const userTurns = (conversations ?? []).filter((c: { speaker: string }) => c.speaker === 'user');
  const responseTimes = userTurns.map((c: { responseTimeMs?: number }) => c.responseTimeMs).filter((t: number | undefined): t is number => typeof t === 'number' && t > 0);
  const avgResponseTime = responseTimes.length > 0 ? Math.round(responseTimes.reduce((a: number, b: number) => a + b, 0) / responseTimes.length) : null;
  const medianResponseTime = responseTimes.length > 0
    ? (() => { const sorted = [...responseTimes].sort((a: number, b: number) => a - b); const mid = Math.floor(sorted.length / 2); return sorted.length % 2 !== 0 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2); })()
    : null;

  const totalGoals = goals?.length ?? goalCompletions?.length ?? 0;
  const achievedGoals = (goalCompletions ?? []).filter((gc: { achieved?: boolean }) => gc.achieved ?? true).length;
  const taskCompletionRate = totalGoals > 0 ? Math.round((achievedGoals / totalGoals) * 100) : null;

  const expressionScore = evaluation?.expressionAppropriatenessScore ?? session.expressionAppropriatenessScore;

  // Every dimension is an independent 0-100 score (see SCORE_DIMENSIONS in
  // lib/ai-engine.ts). These used to be shown against mixed maxes — 25/20/20/
  // 10/10/15 — which matched the old prompt scale and would now render as
  // "87/25" with every bar pegged full.
  const scoreFields = [
    { label: 'Vocabulary', value: evaluation?.vocabularyScore ?? session.vocabularyScore, color: 'accent' as const },
    { label: 'Grammar',    value: evaluation?.grammarScore ?? session.grammarScore,       color: 'success' as const },
    { label: 'Fluency',    value: evaluation?.fluencyScore ?? session.fluencyScore,       color: 'warning' as const },
    { label: 'Cultural',   value: evaluation?.culturalScore ?? session.culturalScore,     color: 'accent' as const },
    { label: 'Task',       value: evaluation?.taskScore ?? session.taskScore,             color: 'success' as const },
    { label: 'Expression', value: expressionScore,                                        color: 'accent' as const },
  ];

  const hasScores = scoreFields.some((f) => f.value != null);

  // Weighting lives only in computeCompositeScore — the report must not
  // re-derive an overall percentage its own way, or the number shown here
  // would disagree with the pass/fail the session actually recorded.
  const pct = hasScores
    ? computeCompositeScore('completed', {
        vocabularyScore: evaluation?.vocabularyScore ?? session.vocabularyScore ?? 0,
        grammarScore: evaluation?.grammarScore ?? session.grammarScore ?? 0,
        fluencyScore: evaluation?.fluencyScore ?? session.fluencyScore ?? 0,
        culturalScore: evaluation?.culturalScore ?? session.culturalScore ?? 0,
        taskScore: evaluation?.taskScore ?? session.taskScore ?? 0,
        expressionAppropriatenessScore: expressionScore ?? 0,
      })
    : null;

  const passed = pct !== null && pct >= PASSING_SCORE_THRESHOLD;

  // The two dimensions furthest from the pass mark — what to actually work on.
  const weakest = scoreFields
    .filter((f) => f.value != null && f.value < PASSING_SCORE_THRESHOLD)
    .sort((a, b) => (a.value ?? 0) - (b.value ?? 0))
    .slice(0, 2);

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

      {/* Verdict — the answer to "did I actually learn this?", which is the
          question the report exists to settle. */}
      {pct !== null && !isActive && (
        <Card className={passed ? 'border-dojo-success/30' : 'border-dojo-warning/30'}>
          <div className="flex items-start gap-4">
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${passed ? 'bg-dojo-success/10' : 'bg-dojo-warning/10'}`}>
              {passed
                ? <Trophy className="h-6 w-6 text-dojo-success" />
                : <Target className="h-6 w-6 text-dojo-warning" />}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-bold tracking-tight text-dojo-text-primary">
                {passed ? 'You can handle this scenario' : 'Not quite there yet'}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-dojo-text-muted">
                {passed
                  ? `You scored ${pct}% overall — above the ${PASSING_SCORE_THRESHOLD}% mark for this scenario.`
                  : `You scored ${pct}%. ${PASSING_SCORE_THRESHOLD}% is the mark for handling this one confidently.`}
              </p>
              {weakest.length > 0 && (
                <p className="mt-3 text-sm leading-relaxed text-dojo-text-primary">
                  <span className="font-semibold">Work on next:</span>{' '}
                  {weakest.map((w) => w.label.toLowerCase()).join(' and ')}.
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href="/review"
                  className="inline-flex items-center gap-2 rounded-[--radius-md] border border-dojo-border bg-dojo-surface px-4 py-2 text-sm font-medium text-dojo-text-primary transition-colors hover:bg-dojo-surface-raised"
                >
                  <Repeat2 className="h-4 w-4" /> Review the words
                </Link>
                {!passed && (
                  <Link
                    href="/hub"
                    className="inline-flex items-center gap-2 rounded-[--radius-md] bg-dojo-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-dojo-accent/90"
                  >
                    <RotateCcw className="h-4 w-4" /> Try it again
                  </Link>
                )}
                {/* A human second opinion on what the AI just assessed. */}
                {TUTORS_ENABLED && (
                  <Link
                    href={`/tutors?session=${session.id}`}
                    className="inline-flex items-center gap-2 rounded-[--radius-md] border border-dojo-border bg-dojo-surface px-4 py-2 text-sm font-medium text-dojo-text-primary transition-colors hover:bg-dojo-surface-raised"
                  >
                    <Users className="h-4 w-4" /> Get a tutor&apos;s opinion
                  </Link>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}

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
                <span className="text-dojo-text-muted">{sf.value != null ? `${sf.value}%` : '—'}</span>
              </div>
              <ProgressBar value={sf.value ?? 0} color={sf.color} size="sm" />
            </div>
          ))}
        </div>
      </Card>

      {/* Response Time & Task Completion */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <h3 className="text-sm font-semibold text-dojo-text-muted uppercase tracking-wider mb-3">Response Time</h3>
          {avgResponseTime !== null ? (
            <div className="space-y-2">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-dojo-text-primary">{avgResponseTime < 1000 ? `${avgResponseTime}ms` : `${(avgResponseTime / 1000).toFixed(1)}s`}</span>
                <span className="text-xs text-dojo-text-muted">average</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-semibold text-dojo-text-primary">{medianResponseTime !== null ? (medianResponseTime < 1000 ? `${medianResponseTime}ms` : `${(medianResponseTime / 1000).toFixed(1)}s`) : '-'}</span>
                <span className="text-xs text-dojo-text-muted">median</span>
              </div>
              <p className="text-xs text-dojo-text-muted">Across {responseTimes.length} user turns</p>
            </div>
          ) : (
            <p className="text-sm text-dojo-text-muted">No response time data available</p>
          )}
        </Card>
        <Card>
          <h3 className="text-sm font-semibold text-dojo-text-muted uppercase tracking-wider mb-3">Task Completion</h3>
          {taskCompletionRate !== null ? (
            <div className="space-y-2">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-dojo-text-primary">{taskCompletionRate}%</span>
                <span className="text-xs text-dojo-text-muted">of goals achieved</span>
              </div>
              <p className="text-xs text-dojo-text-muted">{achievedGoals}/{totalGoals} goals completed</p>
            </div>
          ) : (
            <p className="text-sm text-dojo-text-muted">No goal data available</p>
          )}
        </Card>
      </div>

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
                        {(msg.messageTarget || msg.messageJp) && (
                          <p className={`text-sm font-medium ${isUser ? 'text-white' : 'text-dojo-text-primary'}`}>
                            {cleanDisplay(msg.messageTarget ?? msg.messageJp)}
                          </p>
                        )}
                        {msg.messagePhonetic && (
                          <p className={`mt-1 text-xs italic ${isUser ? 'text-white/70' : 'text-dojo-text-muted'}`}>
                            {msg.messagePhonetic}
                          </p>
                        )}
                        {(msg.messageNative || msg.messageEn) && (
                          <p className={`text-xs ${isUser ? 'text-white/60' : 'text-dojo-text-muted'}`}>
                            {msg.messageNative ?? msg.messageEn}
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
