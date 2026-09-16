'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Volume2, User } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';

interface SessionChooserSession {
  scenarioTitle?: string;
  phase?: string;
  status?: string;
}

interface SessionChooserScenario {
  title?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSessionChooserSession(value: unknown): value is SessionChooserSession {
  return isRecord(value)
    && (value.scenarioTitle === undefined || typeof value.scenarioTitle === 'string')
    && (value.phase === undefined || typeof value.phase === 'string')
    && (value.status === undefined || typeof value.status === 'string');
}

function isSessionChooserScenario(value: unknown): value is SessionChooserScenario {
  return isRecord(value) && (value.title === undefined || typeof value.title === 'string');
}

function getErrorMessage(value: unknown): string | null {
  return isRecord(value) && typeof value.error === 'string' ? value.error : null;
}

export default function SessionChooserPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = Number(params.sessionId);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [session, setSession] = useState<SessionChooserSession | null>(null);
  const [scenario, setScenario] = useState<SessionChooserScenario | null>(null);

  useEffect(() => {
    if (!Number.isFinite(sessionId)) {
      // Invalid route parameters cannot be loaded, so terminate the initial
      // loading state in the same effect that validates them.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoadError('Invalid session');
      setLoading(false);
      return;
    }
    async function load() {
      try {
        const res = await fetch(`/api/sessions/${sessionId}`, { credentials: 'include' });
        if (!res.ok) {
          const errorBody: unknown = await res.json().catch(() => null);
          throw new Error(getErrorMessage(errorBody) ?? 'Session not found');
        }
        const data: unknown = await res.json();
        if (
          !isRecord(data) ||
          !isSessionChooserSession(data.session) ||
          !isSessionChooserScenario(data.scenario)
        ) {
          throw new Error('Invalid session response');
        }
        setSession(data.session);
        setScenario(data.scenario);
      } catch (error: unknown) {
        setLoadError(error instanceof Error ? error.message : 'Failed to load session');
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl w-full">
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
