'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getTargetLangConfig } from '@/lib/language';
import { ArrowLeft, MessageSquare, Volume2, User } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';

export default function SessionChooserPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = Number(params.sessionId);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [session, setSession] = useState<any>(null);
  const [scenario, setScenario] = useState<any>(null);

  useEffect(() => {
    if (!Number.isFinite(sessionId)) {
      setLoadError('Invalid session');
      setLoading(false);
      return;
    }
    async function load() {
      try {
        const res = await fetch(`/api/sessions/${sessionId}`);
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Session not found'); }
        const data = await res.json();
        setSession(data.session);
        setScenario(data.scenario);
      } catch (e: any) {
        setLoadError(e.message ?? 'Failed to load session');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [sessionId]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="animate-pulse text-dojo-text-muted text-sm">Loading session…</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
        <p className="text-dojo-text-muted text-sm">{loadError}</p>
        <button onClick={() => router.push('/home')} className="text-sm text-dojo-accent">Back to Home</button>
      </div>
    );
  }

  const title = scenario?.title ?? session?.scenarioTitle ?? 'Roleplay';

  const modes = [
    {
      key: 'chat',
      label: 'Chat',
      desc: 'Text-only conversation. Type your responses.',
      icon: MessageSquare,
      href: `/session/${sessionId}/chat`,
      color: 'border-dojo-accent hover:bg-dojo-accent/10',
      iconColor: 'text-dojo-accent',
    },
    {
      key: 'voice',
      label: 'Voice',
      desc: 'Speak your responses hands-free.',
      icon: Volume2,
      href: `/session/${sessionId}/voice`,
      color: 'border-[#3FB27F] hover:bg-[#3FB27F]/10',
      iconColor: 'text-[#3FB27F]',
    },
    {
      key: 'avatar',
      label: 'Avatar',
      desc: 'Full avatar voice conversation with barge-in.',
      icon: User,
      href: `/session/${sessionId}/avatar`,
      color: 'border-[#8B5CF6] hover:bg-[#8B5CF6]/10',
      iconColor: 'text-[#8B5CF6]',
    },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-4 border-b border-dojo-border shrink-0">
        <button onClick={() => router.push('/home')} className="text-dojo-text-muted hover:text-dojo-text-primary">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold text-dojo-text-primary">{title}</span>
        {session?.phase && <Badge variant="outline">{session.phase}</Badge>}
      </div>

      {/* Mode cards */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl w-full">
          {modes.map((mode) => {
            const Icon = mode.icon;
            return (
              <button
                key={mode.key}
                onClick={() => router.push(mode.href)}
                className={`flex flex-col items-center gap-4 p-8 rounded-2xl border-2 bg-dojo-surface/60 backdrop-blur-sm transition-all duration-200 ${mode.color} group`}
              >
                <div className={`h-14 w-14 rounded-full flex items-center justify-center border-2 border-current ${mode.iconColor} group-hover:scale-110 transition-transform`}>
                  <Icon className="h-6 w-6" />
                </div>
                <div className="text-center">
                  <p className="text-base font-bold text-dojo-text-primary">{mode.label}</p>
                  <p className="text-xs text-dojo-text-muted mt-1">{mode.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Footer link to report if completed */}
      {session?.status === 'completed' && (
        <div className="shrink-0 px-4 py-3 border-t border-dojo-border text-center">
          <button
            onClick={() => router.push(`/sessions/${sessionId}/report`)}
            className="text-sm text-dojo-accent hover:underline"
          >
            View Report →
          </button>
        </div>
      )}
    </div>
  );
}
