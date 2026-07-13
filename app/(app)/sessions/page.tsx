/* ───────────────────────────────────────────────
   Sessions — full list with share/delete/report and conversation continue
   For active sessions: resume → /session/new
   For completed: view report with new evaluation structure
   ─────────────────────────────────────────────── */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { LiveBadge } from '@/components/ui/LiveBadge';
import { sessionHistory as mockSessions } from '@/lib/data/sessions';
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Share2,
  Trash2,
  Sparkles,
  Play,
  RotateCcw,
} from 'lucide-react';

interface SessionRecord {
  id: number;
  scenarioId: number;
  sessionNumber: number;
  status: string;
  totalTurns: number;
  vocabularyScore: number | null;
  grammarScore: number | null;
  fluencyScore: number | null;
  culturalScore: number | null;
  taskScore: number | null;
  feedback: string | null;
  startedAt: string;
  completedAt: string | null;
  scenarioTitle?: string;
}

function computeTotalPct(s: SessionRecord): number | null {
  if (s.status !== 'completed' || s.vocabularyScore === null) return null;
  const sum = (s.vocabularyScore ?? 0) + (s.grammarScore ?? 0) + (s.fluencyScore ?? 0) + (s.culturalScore ?? 0) + (s.taskScore ?? 0);
  return Math.round((sum / 100) * 100);
}

export default function SessionsPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState<Record<number, string>>({});
  const [deleting, setDeleting] = useState<number | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/sessions');
        const data = await res.json();
        if (data.success && data.sessions.length > 0) {
          setSessions(data.sessions);
        } else {
          setSessions(mockSessions.map(s => ({ ...s, scenarioTitle: s.scenarioTitle })) as any);
        }
      } catch (e) {
        console.error('Failed to load sessions:', e);
        setSessions(mockSessions.map(s => ({ ...s, scenarioTitle: s.scenarioTitle })) as any);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleShare(sessionId: number) {
    if (sharing[sessionId]) { navigator.clipboard.writeText(sharing[sessionId]); return; }
    try {
      const res = await fetch(`/api/sessions/${sessionId}/share`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        const link = `${window.location.origin}/share/${data.token}`;
        setSharing(prev => ({ ...prev, [sessionId]: link }));
        navigator.clipboard.writeText(link);
      }
    } catch (e) { console.error('Share failed:', e); }
  }

  async function handleDelete(sessionId: number) {
    if (!confirm('Delete this session? This cannot be undone.')) return;
    setDeleting(sessionId);
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) setSessions(prev => prev.filter(s => s.id !== sessionId));
    } catch (e) { console.error('Delete failed:', e); }
    finally { setDeleting(null); }
  }

  const activeSessions = sessions.filter(s => s.status === 'active');
  const completedSessions = sessions.filter(s => s.status === 'completed');

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6">
        <Link href="/home" className="inline-flex items-center gap-1 text-sm text-dojo-text-muted hover:text-dojo-text-primary mb-4">
          <ArrowLeft className="h-4 w-4" /> Back to Home
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-dojo-text-primary">All Sessions</h1>
            <p className="text-sm text-dojo-text-muted mt-1">
              {loading ? 'Loading...' : `${sessions.length} total · ${activeSessions.length} in progress`}
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={() => router.push('/hub')}>
            <Sparkles className="h-4 w-4" /> New Practice
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <Card key={i} className="!p-4">
              <div className="animate-pulse space-y-2">
                <div className="h-4 w-32 rounded bg-dojo-border" />
                <div className="h-3 w-64 rounded bg-dojo-border" />
              </div>
            </Card>
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-dojo-text-muted mb-2">No sessions yet</p>
          <p className="text-xs text-dojo-text-muted">Start your first role-play from the Hub</p>
          <Button variant="primary" size="sm" className="mt-4" onClick={() => router.push('/hub')}>
            <Sparkles className="h-4 w-4" /> Start Practicing
          </Button>
        </Card>
      ) : (
        <div className="space-y-2">
          {/* Active sessions first */}
          {activeSessions.map(session => (
            <SessionCard key={session.id} session={session}
              deleting={deleting}
              sharing={sharing}
              onShare={handleShare}
              onDelete={handleDelete}
              isActive
            />
          ))}
          {/* Completed sessions */}
          {completedSessions.map(session => (
            <SessionCard key={session.id} session={session}
              deleting={deleting}
              sharing={sharing}
              onShare={handleShare}
              onDelete={handleDelete}
              isActive={false}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SessionCard({
  session,
  deleting,
  sharing,
  onShare,
  onDelete,
  isActive,
}: {
  session: SessionRecord;
  deleting: number | null;
  sharing: Record<number, string>;
  onShare: (id: number) => void;
  onDelete: (id: number) => void;
  isActive: boolean;
}) {
  const pct = computeTotalPct(session);

  return (
    <Card hoverable className={`!p-4 ${deleting === session.id ? 'opacity-50' : ''}`}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {isActive ? (
              <>
                <Badge variant="accent">In Progress</Badge>
                <LiveBadge />
              </>
            ) : (
              <>
                <Badge variant="default">Completed</Badge>
                {pct !== null && (
                  <span className="text-xs font-semibold text-dojo-success">{pct}% Score</span>
                )}
              </>
            )}
            <span className="text-xs text-dojo-text-muted">Attempt #{session.sessionNumber}</span>
          </div>
          <p className="text-sm font-semibold text-dojo-text-primary truncate">
            {session.scenarioTitle ?? `Session #${session.id}`}
          </p>
          <p className="text-xs text-dojo-text-muted mt-0.5">
            {new Date(session.startedAt).toLocaleDateString()} · {session.totalTurns} turns
            {session.completedAt && ` · Completed ${new Date(session.completedAt).toLocaleDateString()}`}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Primary action: Continue or View Report */}
          {isActive ? (
            <Link href={`/session/${session.id}`}>
              <Button variant="primary" size="sm">
                <Play className="h-4 w-4" /> Continue
              </Button>
            </Link>
          ) : (
            <Link href={`/sessions/${session.id}/report`}>
              <Button variant="primary" size="sm">
                <RotateCcw className="h-4 w-4" /> View Report
              </Button>
            </Link>
          )}

          {/* Share */}
          <Button variant="secondary" size="sm" onClick={() => onShare(session.id)}>
            <Share2 className="h-4 w-4" />
            {sharing[session.id] ? 'Copied' : 'Share'}
          </Button>

          {/* Delete */}
          <Button variant="ghost" size="sm" className="text-dojo-danger hover:text-dojo-danger"
            onClick={() => onDelete(session.id)} disabled={deleting === session.id}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
