/* ───────────────────────────────────────────────
   Session Summary + Review (Panels 07-08)
   Tabbed: Conversation / Feedback / Corrections / Vocabulary
   ─────────────────────────────────────────────── */

'use client';

import { useParams, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Tabs, type Tab } from '@/components/ui/Tabs';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { TrendValue } from '@/components/ui/TrendValue';
import { sessionHistory } from '@/lib/mock-data/sessions';
import { getSituationById } from '@/lib/mock-data/situations';
import {
  ArrowLeft,
  ArrowRight,
  Share2,
  RotateCcw,
  CheckCircle,
  AlertCircle,
  BookOpen,
  MessageSquare,
  Star,
  ChevronRight,
} from 'lucide-react';

const tabs: Tab[] = [
  { id: 'conversation', label: 'Conversation' },
  { id: 'feedback', label: 'Feedback' },
  { id: 'corrections', label: 'Corrections' },
  { id: 'vocabulary', label: 'Vocabulary' },
];

export default function SessionReportPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = Number(params.id);

  const session = sessionHistory.find((s) => s.id === sessionId);
  const situation = session ? getSituationById(session.scenarioId) : null;

  if (!session || !situation) {
    return (
      <div className="mx-auto max-w-4xl p-6 text-center">
        <p className="text-dojo-text-muted">Session not found</p>
        <Button variant="secondary" onClick={() => router.push('/home')} className="mt-4">
          <ArrowLeft className="h-4 w-4" /> Back to Home
        </Button>
      </div>
    );
  }

  const scores = [
    { label: 'Vocabulary', value: session.vocabularyScore ?? 0, max: 30, color: 'accent' as const },
    { label: 'Grammar',    value: session.grammarScore ?? 0,    max: 25, color: 'success' as const },
    { label: 'Fluency',    value: session.fluencyScore ?? 0,    max: 20, color: 'warning' as const },
    { label: 'Cultural',   value: session.culturalScore ?? 0,   max: 15, color: 'accent' as const },
    { label: 'Task',       value: session.taskScore ?? 0,       max: 10, color: 'success' as const },
  ];

  const totalScore = scores.reduce((s, x) => s + x.value, 0);
  const totalMax = scores.reduce((s, x) => s + x.max, 0);
  const pct = Math.round((totalScore / totalMax) * 100);

  return (
    <div className="mx-auto max-w-4xl p-6">
      {/* Back + actions */}
      <div className="mb-6 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => router.push('/home')}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm">
            <Share2 className="h-4 w-4" /> Share
          </Button>
          <Button variant="primary" size="sm">
            <RotateCcw className="h-4 w-4" /> Retry
          </Button>
        </div>
      </div>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-dojo-text-primary">{situation.title}</h1>
        <p className="mt-1 text-sm text-dojo-text-muted">
          Session #{session.sessionNumber} · {session.totalTurns} turns ·{' '}
          {new Date(session.startedAt).toLocaleDateString()}
        </p>
      </div>

      {/* Score Overview */}
      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <div className="text-center">
            <div className="text-4xl font-bold text-dojo-text-primary">{pct}%</div>
            <p className="mt-1 text-xs text-dojo-text-muted">Overall Score</p>
            <ProgressBar value={pct} color="accent" size="md" className="mt-3" />
            <div className="mt-4 flex justify-center gap-4">
              <TrendValue value={session.totalTurns} trend="up" trendLabel="turns" />
              <TrendValue value={`${session.vocabularyScore}/${session.grammarScore}/${session.fluencyScore}/${session.culturalScore}/${session.taskScore}`} />
            </div>
          </div>
        </Card>

        {/* Score breakdown bars */}
        <Card className="lg:col-span-2">
          <h3 className="mb-4 text-sm font-semibold text-dojo-text-muted uppercase tracking-wider">
            Score Breakdown
          </h3>
          <div className="space-y-3">
            {scores.map((score) => (
              <div key={score.label}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-dojo-text-primary">{score.label}</span>
                  <span className="text-dojo-text-muted">
                    {score.value}/{score.max}
                  </span>
                </div>
                <ProgressBar
                  value={score.value}
                  max={score.max}
                  color={score.color}
                  size="sm"
                />
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Tabs for detailed review */}
      <Card>
        <Tabs tabs={tabs} renderPanel={(tabId) => {
          switch (tabId) {
            case 'conversation':
              return <ConversationTab session={session} />;
            case 'feedback':
              return <FeedbackTab session={session} />;
            case 'corrections':
              return <CorrectionsTab />;
            case 'vocabulary':
              return <VocabularyTab />;
            default:
              return null;
          }
        }} />
      </Card>
    </div>
  );
}

/* ── Tab panels ────────────────────────────── */

function ConversationTab({ session }: { session: any }) {
  const mockTurns = [
    { speaker: 'ai', text: 'こんにちは！ご注文はお決まりですか？', en: 'Hello! Have you decided your order?', emotion: 'friendly' },
    { speaker: 'user', text: 'はい、ラーメンをください。', en: 'Yes, ramen please.', corrected: true },
    { speaker: 'ai', text: 'かしこまりました。お飲み物はいかがですか？', en: 'Certainly. Would you like something to drink?', emotion: 'polite' },
    { speaker: 'user', text: 'お水をください。', en: 'Water please.', corrected: false },
    { speaker: 'ai', text: 'ありがとうございます。少々お待ちください。', en: 'Thank you. Please wait a moment.', emotion: 'grateful' },
  ];

  return (
    <div className="space-y-4">
      {mockTurns.map((turn, i) => (
        <div key={i} className={`flex gap-3 ${turn.speaker === 'user' ? 'flex-row-reverse' : ''}`}>
          <div className={`max-w-[75%] rounded-2xl px-4 py-3 ${
            turn.speaker === 'ai'
              ? 'bg-dojo-surface border border-dojo-border rounded-tl-none'
              : 'bg-dojo-accent rounded-br-none'
          }`}>
            <p className={`text-sm ${turn.speaker === 'user' ? 'text-white' : 'text-dojo-text-primary'}`}>
              {turn.text}
            </p>
            <p className={`mt-1 text-xs ${turn.speaker === 'user' ? 'text-white/70' : 'text-dojo-text-muted'}`}>
              {turn.en}
            </p>
            {turn.speaker === 'user' && turn.corrected && (
              <div className="mt-2 rounded-lg bg-dojo-success/10 px-2.5 py-1.5 border border-dojo-success/30">
                <p className="text-xs text-dojo-success flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" /> Correct usage
                </p>
              </div>
            )}
            {turn.speaker === 'ai' && (
              <span className="mt-1 inline-flex items-center gap-1 text-[10px] text-dojo-text-muted">
                {turn.emotion}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function FeedbackTab({ session }: { session: any }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-dojo-surface border border-dojo-border p-4">
        <h4 className="text-sm font-semibold text-dojo-text-primary mb-2">AI Sensei Feedback</h4>
        <p className="text-sm text-dojo-text-muted leading-relaxed">
          {session.feedback ?? 'Good progress! Your polite forms are improving. Focus on particle usage (を vs が).'}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl bg-dojo-surface border border-dojo-border p-4">
          <div className="flex items-center gap-2 mb-2">
            <Star className="h-4 w-4 text-dojo-warning" />
            <h4 className="text-sm font-semibold text-dojo-text-primary">Strengths</h4>
          </div>
          <ul className="space-y-1.5">
            {['Good vocabulary range', 'Clear pronunciation', 'Natural pacing'].map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-dojo-text-muted">
                <CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-dojo-success" />
                {s}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl bg-dojo-surface border border-dojo-border p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="h-4 w-4 text-dojo-warning" />
            <h4 className="text-sm font-semibold text-dojo-text-primary">Areas to Improve</h4>
          </div>
          <ul className="space-y-1.5">
            {['Particle usage (を vs が)', 'Polite form consistency', 'Speed of response'].map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-dojo-text-muted">
                <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-dojo-warning" />
                {s}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function CorrectionsTab() {
  const corrections = [
    { type: 'particle', original: '水を欲しい', corrected: '水が欲しい', explanation: 'Use が with 欲しい to mark the thing you want.' },
    { type: 'grammar', original: '私は行くレストラン', corrected: '私が行くレストラン', explanation: 'Use が in relative clauses to mark the subject of the clause.' },
  ];

  return (
    <div className="space-y-3">
      {corrections.map((c, i) => (
        <div key={i} className="rounded-xl bg-dojo-surface border border-dojo-border p-4">
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="accent" className="uppercase">{c.type}</Badge>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-dojo-text-muted mb-1">Your sentence</p>
              <p className="text-dojo-danger line-through">{c.original}</p>
            </div>
            <div>
              <p className="text-xs text-dojo-text-muted mb-1">Corrected</p>
              <p className="text-dojo-success">{c.corrected}</p>
            </div>
          </div>
          <p className="mt-2 text-xs text-dojo-text-muted">{c.explanation}</p>
        </div>
      ))}
    </div>
  );
}

function VocabularyTab() {
  const vocab = [
    { jp: 'メニュー', romaji: 'menyuu', en: 'menu', used: true },
    { jp: 'おすすめ', romaji: 'osusume', en: 'recommendation', used: true },
    { jp: 'お会計', romaji: 'okaikei', en: 'bill/check', used: false },
    { jp: '取り皿', romaji: 'torizara', en: 'small plate', used: true },
    { jp: 'お冷', romaji: 'ohiya', en: 'cold water', used: false },
  ];

  return (
    <div className="space-y-2">
      {vocab.map((v, i) => (
        <div key={i} className="flex items-center justify-between rounded-xl bg-dojo-surface border border-dojo-border px-4 py-3">
          <div className="flex items-center gap-3">
            <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
              v.used ? 'bg-dojo-success/20 text-dojo-success' : 'bg-dojo-border text-dojo-text-muted'
            }`}>
              {v.used ? '✓' : i + 1}
            </span>
            <div>
              <p className="text-sm font-medium text-dojo-text-primary">{v.jp}</p>
              <p className="text-xs text-dojo-text-muted">{v.romaji}</p>
            </div>
          </div>
          <p className="text-xs text-dojo-text-muted">{v.en}</p>
        </div>
      ))}
    </div>
  );
}
