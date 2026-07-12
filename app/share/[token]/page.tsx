/* ───────────────────────────────────────────────
   Shared Session — read-only session view for public
   Uses new project UI components (Card, Badge, Avatar, Button)
   ─────────────────────────────────────────────── */

'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ArrowLeft, Lock } from 'lucide-react';

export default function SharedSessionPage() {
  const params = useParams();
  const token = params.token as string;

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/share/${token}`);
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Not found'); }
        const d = await res.json();
        setData(d);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-dvh bg-dojo-canvas p-6">
        <div className="mx-auto max-w-3xl animate-pulse space-y-4">
          <div className="h-8 w-64 bg-dojo-border rounded" />
          <div className="h-4 w-48 bg-dojo-border rounded" />
          <div className="h-64 bg-dojo-border rounded-xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-dvh bg-dojo-canvas flex items-center justify-center p-6">
        <Card className="text-center py-10 px-8 max-w-md">
          <div className="text-3xl mb-3">🔒</div>
          <h2 className="text-lg font-semibold text-dojo-text-primary mb-2">Cannot Load Session</h2>
          <p className="text-sm text-dojo-text-muted mb-2">{error}</p>
          <p className="text-xs text-dojo-text-muted">The share link may be invalid or the session was deleted.</p>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  const { scenario, session, conversations, evaluation, goalCompletions } = data;

  const scoreFields = [
    { label: 'Vocabulary', value: evaluation?.vocabularyScore ?? 0, max: 30 },
    { label: 'Grammar',    value: evaluation?.grammarScore ?? 0,    max: 25 },
    { label: 'Fluency',    value: evaluation?.fluencyScore ?? 0,    max: 20 },
    { label: 'Cultural',   value: evaluation?.culturalScore ?? 0,   max: 15 },
    { label: 'Task',       value: evaluation?.taskScore ?? 0,       max: 10 },
  ];

  const totalScore = scoreFields.reduce((s, x) => s + x.value, 0);
  const totalMax = scoreFields.reduce((s, x) => s + x.max, 0);
  const pct = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : null;

  return (
    <div className="min-h-dvh bg-dojo-canvas">
      <div className="mx-auto max-w-3xl p-6 space-y-6">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2 mb-2">
            <span className="text-2xl">🥋</span>
            <h1 className="text-xl font-bold text-dojo-text-primary">AI DOJO — Shared Session</h1>
          </div>
          <Badge variant="accent">
            <Lock className="h-3 w-3" /> READ ONLY
          </Badge>
          <p className="text-xs text-dojo-text-muted mt-2">You are viewing a shared role-play session. No account needed.</p>
        </div>

        {/* Scenario Info */}
        <Card>
          <h2 className="text-lg font-semibold text-dojo-text-primary mb-3">{scenario.title}</h2>
          <div className="flex items-center gap-2 mb-3">
            <Badge variant={scenario.difficulty === 'beginner' ? 'beginner' : 'intermediate'}>
              {scenario.difficulty}
            </Badge>
            <Badge variant="default">{scenario.domain}</Badge>
          </div>
          <p className="text-sm text-dojo-text-muted mb-4 leading-relaxed">{scenario.context}</p>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <p className="text-dojo-text-muted mb-1">AI Character</p>
              <p className="text-dojo-text-primary font-semibold">{scenario.aiCharacterName} ({scenario.aiCharacterRole})</p>
            </div>
            <div>
              <p className="text-dojo-text-muted mb-1">You Play</p>
              <p className="text-dojo-text-primary font-semibold">{scenario.userCharacterName} — {scenario.userCharacterRole}</p>
            </div>
          </div>
          <p className="text-xs text-dojo-text-muted mt-4 pt-3 border-t border-dojo-border">
            Session #{session.sessionNumber} · {session.totalTurns} turns ·
            {session.completedAt ? ` Completed ${new Date(session.completedAt).toLocaleDateString()}` : ' In progress'}
          </p>
        </Card>

        {/* Evaluation (if available) */}
        {evaluation && (
          <Card>
            <h3 className="text-sm font-semibold text-dojo-text-muted uppercase tracking-wider mb-4">
              📊 Performance Evaluation
            </h3>
            <div className="space-y-3">
              {scoreFields.map(sf => (
                <div key={sf.label}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-dojo-text-primary">{sf.label}</span>
                    <span className="text-dojo-text-muted">{sf.value}/{sf.max}</span>
                  </div>
                  <ProgressBar value={sf.value} max={sf.max} color="accent" size="sm" />
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-xl bg-dojo-success/10 border border-dojo-success/30 p-4">
              <p className="text-xs font-semibold text-dojo-success mb-1">AI Sensei Feedback</p>
              <p className="text-sm text-dojo-text-primary">{evaluation.feedback}</p>
            </div>
          </Card>
        )}

        {/* Goals */}
        {goalCompletions?.length > 0 && (
          <Card>
            <h3 className="text-sm font-semibold text-dojo-text-muted uppercase tracking-wider mb-3">Goals Completed</h3>
            <div className="space-y-2">
              {goalCompletions.map((gc: any, i: number) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold
                    ${gc.achieved ?? true ? 'bg-dojo-success text-white' : 'border border-dojo-border text-dojo-text-muted'}`}>
                    {gc.achieved ?? true ? '✓' : i + 1}
                  </span>
                  <span className={gc.achieved ?? true ? 'text-dojo-text-primary' : 'text-dojo-text-muted'}>
                    {gc.goalText}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Conversation */}
        <Card>
          <h3 className="text-sm font-semibold text-dojo-text-muted uppercase tracking-wider mb-4">Conversation Transcript</h3>
          {conversations.length === 0 ? (
            <p className="text-dojo-text-muted text-center py-8">No messages in this session.</p>
          ) : (
            <div className="space-y-4">
              {conversations
                .sort((a: any, b: any) => (a.turnNo ?? 0) - (b.turnNo ?? 0))
                .map((msg: any, i: number) => {
                  const isUser = msg.speaker === 'user';
                  return (
                    <div key={i} className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
                      <Avatar name={isUser ? 'You' : scenario.aiCharacterName}
                        color={isUser ? '#2D3BC5' : '#D14343'} size="sm" />
                      <div className={`max-w-[75%]`}>
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
                          {(msg.messageRomaji || msg.messageEn) && (
                            <div className={`mt-1 text-xs ${isUser ? 'text-white/70' : 'text-dojo-text-muted'}`}>
                              {msg.messageRomaji && <i>{msg.messageRomaji}</i>}
                              {msg.messageRomaji && msg.messageEn && <br />}
                              {msg.messageEn}
                            </div>
                          )}
                        </div>
                        {msg.gestureHint && (
                          <span className="mt-1 inline-flex items-center gap-1 text-[10px] text-dojo-text-muted italic">
                            🎭 {msg.gestureHint}
                          </span>
                        )}
                        {msg.corrections?.length > 0 && (
                          <div className="mt-1 space-y-1">
                            {msg.corrections.map((c: any, j: number) => (
                              <div key={j} className="rounded-lg bg-dojo-warning/10 border border-dojo-warning/30 px-3 py-2 text-xs">
                                <Badge variant="accent" className="mb-1">{c.correctionType}</Badge>
                                <p className="text-dojo-text-primary">
                                  <span className="line-through text-dojo-danger">{c.originalText}</span>
                                  &nbsp;→&nbsp;
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
          )}
        </Card>
      </div>
    </div>
  );
}
