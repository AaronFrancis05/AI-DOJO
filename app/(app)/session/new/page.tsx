/* ───────────────────────────────────────────────
   Roleplay Room Shell (Panel 06) — Static layout placeholder
   No 3D/voice/Gemini calls this phase — just the styled shell
   ─────────────────────────────────────────────── */

'use client';

import { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { LiveBadge } from '@/components/ui/LiveBadge';
import { Avatar } from '@/components/ui/Avatar';
import { characters } from '@/lib/data/characters';
import { domains } from '@/lib/data/domains';
import { situations } from '@/lib/data/situations';
import type { SkillLevel } from '@/lib/design-tokens';
import {
  ArrowLeft,
  Mic,
  Send,
  Pause,
  Flag,
  Target,
  Lightbulb,
  Smile,
} from 'lucide-react';

export default function RoleplayRoomWrapper() {
  return (
    <Suspense fallback={
      <div className="flex h-full items-center justify-center">
        <div className="animate-pulse text-dojo-text-muted">Loading...</div>
      </div>
    }>
      <RoleplayRoomPage />
    </Suspense>
  );
}

function RoleplayRoomPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const domainSlug = searchParams.get('domain') ?? '';
  const situationId = Number(searchParams.get('situation') ?? 0);
  const characterId = Number(searchParams.get('character') ?? 0);
  const mode = searchParams.get('mode') ?? 'standard';

  const situation = situations.find(s => s.id === situationId);
  const character = characters.find((c) => c.id === characterId);
  const domain = domains.find((d) => d.slug === domainSlug);

  if (!situation || !character) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="text-dojo-text-muted mb-4">Invalid session configuration</p>
          <Button variant="secondary" onClick={() => router.push('/hub')}>
            <ArrowLeft className="h-4 w-4" /> Back to Hub
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-dojo-border px-6 py-3">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push('/hub')}>
            <ArrowLeft className="h-4 w-4" />
            Exit
          </Button>
          <div className="h-4 w-px bg-dojo-border" />
          <div>
            <p className="text-sm font-semibold text-dojo-text-primary">
              {domain?.name ?? 'Roleplay'} · {situation.title}
            </p>
            <p className="text-xs text-dojo-text-muted">
              with {character.name} · {mode} mode
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={situation.skillLevel as SkillLevel}>{situation.skillLevel}</Badge>
          <LiveBadge />
        </div>
      </div>

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Chat area */}
        <div className="flex-1 flex flex-col">
          {/* Messages area */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {/* AI welcome message */}
            <div className="flex gap-3">
              <Avatar name={character.name} color={character.avatarColor} size="md" />
              <div className="max-w-[70%]">
                <p className="text-xs text-dojo-text-muted mb-1">{character.name}</p>
                <div className="rounded-2xl rounded-tl-none bg-dojo-surface-raised px-4 py-3 border border-dojo-border">
                  <p className="text-sm text-dojo-text-primary">
                    こんにちは！{character.name}です。よろしくお願いします。
                  </p>
                  <p className="mt-1 text-xs text-dojo-text-muted italic">
                    Hello! I&apos;m {character.name}. Nice to meet you.
                  </p>
                  <p className="text-xs text-dojo-text-muted italic">Konnichiwa! {character.name} desu. Yoroshiku onegai shimasu.</p>
                </div>
                {/* Emotion tag */}
                <span className="mt-1 inline-flex items-center gap-1 text-[10px] text-dojo-text-muted">
                  <Smile className="h-3 w-3" />
                  friendly · slight bow
                </span>
              </div>
            </div>

            {/* Placeholder for more turns */}
            <div className="flex justify-end">
              <div className="max-w-[70%]">
                <div className="rounded-2xl rounded-br-none bg-dojo-accent px-4 py-3">
                  <p className="text-sm text-white">
                    はじめまして、アレックスです。よろしくお願いします。
                  </p>
                </div>
              </div>
            </div>

            {/* Teaching tip example */}
            <div className="flex gap-3">
              <Avatar name={character.name} color={character.avatarColor} size="md" />
              <div className="max-w-[70%]">
                <div className="rounded-2xl rounded-tl-none bg-dojo-surface-raised px-4 py-3 border border-dojo-border">
                  <p className="text-sm text-dojo-text-primary">
                    アレックスさん、こんにちは！ご注文はお決まりですか？
                  </p>
                  <p className="mt-1 text-xs text-dojo-text-muted italic">
                    Alex-san, hello! Have you decided your order?
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Input area */}
          <div className="border-t border-dojo-border p-4">
            <div className="flex items-center gap-3">
              <button className="flex h-10 w-10 items-center justify-center rounded-full bg-dojo-surface-raised border border-dojo-border text-dojo-text-muted hover:text-dojo-text-primary transition-colors">
                <Mic className="h-5 w-5" />
              </button>
              <input
                type="text"
                placeholder="Type your response in Japanese..."
                className="flex-1 rounded-[--radius-md] bg-dojo-surface border border-dojo-border px-4 py-2.5 text-sm text-dojo-text-primary placeholder:text-dojo-text-muted outline-none focus:border-dojo-accent transition-colors"
              />
              <Button variant="primary" size="md">
                <Send className="h-4 w-4" />
                Send
              </Button>
            </div>
          </div>
        </div>

        {/* Sidebar — Goals + Tips */}
        <div className="w-72 border-l border-dojo-border p-4 space-y-4 overflow-y-auto">
          {/* Session Info */}
          <Card>
            <div className="flex items-center gap-2 mb-2">
              <Target className="h-4 w-4 text-dojo-accent" />
              <h3 className="text-xs font-semibold text-dojo-text-muted uppercase tracking-wider">Goals</h3>
            </div>
            <ul className="space-y-2">
              {[
                { text: 'Greet the staff appropriately', done: true },
                { text: 'Order food using polite phrases', done: false },
                { text: 'Ask about menu items', done: false },
                { text: 'Pay and thank the staff', done: false },
              ].map((goal, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                      goal.done ? 'bg-dojo-success text-white' : 'border border-dojo-border text-dojo-text-muted'
                    }`}
                  >
                    {goal.done ? '✓' : i + 1}
                  </span>
                  <span className={`text-xs ${goal.done ? 'text-dojo-success line-through' : 'text-dojo-text-primary'}`}>
                    {goal.text}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          {/* Vocabulary */}
          <Card>
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb className="h-4 w-4 text-dojo-warning" />
              <h3 className="text-xs font-semibold text-dojo-text-muted uppercase tracking-wider">Key Vocabulary</h3>
            </div>
            <div className="space-y-2">
              {[
                { jp: 'メニュー', en: 'menu' },
                { jp: 'おすすめ', en: 'recommendation' },
                { jp: 'お会計', en: 'bill / check' },
              ].map((v, i) => (
                <div key={i} className="flex justify-between text-xs">
                  <span className="text-dojo-text-primary font-medium">{v.jp}</span>
                  <span className="text-dojo-text-muted">{v.en}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Controls */}
          <div className="space-y-2">
            <Button variant="secondary" size="sm" className="w-full">
              <Pause className="h-4 w-4" />
              Pause Session
            </Button>
            <Button variant="ghost" size="sm" className="w-full text-dojo-danger">
              <Flag className="h-4 w-4" />
              End Session
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
