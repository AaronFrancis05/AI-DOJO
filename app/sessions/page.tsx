'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import NavBar from '@/components/NavBar';

interface SessionRecord {
  id: number;
  scenarioId: number;
  scenarioTitle: string;
  scenarioDomain: string;
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
}

export default function SessionsPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [shareState, setShareState] = useState<Record<number, string>>({});
  const [deleting, setDeleting] = useState<number | null>(null);

  useEffect(() => {
    async function load() {
      const sesRes = await fetch('/api/sessions');
      const sesData = await sesRes.json();
      if (sesData.success) {
        setSessions(sesData.sessions);
      }

      setLoading(false);
    }
    load();
  }, [router]);

  async function handleShare(sessionId: number) {
    if (shareState[sessionId]) {
      navigator.clipboard.writeText(shareState[sessionId]);
      return;
    }

    try {
      const res = await fetch(`/api/sessions/${sessionId}/share`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        const link = `${window.location.origin}/share/${data.token}`;
        setShareState(prev => ({ ...prev, [sessionId]: link }));
        navigator.clipboard.writeText(link).catch(() => {});
      }
    } catch (e) {
      console.error('Share failed:', e);
    }
  }

  async function handleDelete(sessionId: number) {
    if (!confirm('Delete this session? This cannot be undone.')) return;

    setDeleting(sessionId);
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setSessions(prev => prev.filter(s => s.id !== sessionId));
      }
    } catch (e) {
      console.error('Delete failed:', e);
    } finally {
      setDeleting(null);
    }
  }

  if (loading) return <div style={{ textAlign: 'center', padding: '50px' }}>Loading...</div>;

  return (
    <>
      <NavBar />
      <div style={{ maxWidth: '900px', margin: '40px auto', padding: '20px', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <h1 style={{ margin: 0 }}>📋 My Sessions</h1>
        <Link href="/" style={{ textDecoration: 'none' }}>
          <button style={{ padding: '8px 16px', background: '#000', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
            &larr; Back to Scenarios
          </button>
        </Link>
      </div>

      {sessions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', background: '#f7fafc', borderRadius: '8px', color: '#666' }}>
          No sessions yet. Start a role-play!
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {sessions.map(session => (
            <div
              key={session.id}
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                padding: '16px 20px',
                background: '#fff',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                opacity: deleting === session.id ? 0.5 : 1,
              }}
            >
              <div>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '1.1rem' }}>
                  {session.scenarioTitle}
                  <span style={{ fontSize: '0.8rem', color: '#666', marginLeft: '8px' }}>
                    Attempt #{session.sessionNumber}
                  </span>
                </h3>
                <div style={{ display: 'flex', gap: '10px', fontSize: '0.85rem', color: '#666' }}>
                  <span>Status: <strong>{session.status}</strong></span>
                  <span>Turns: {session.totalTurns}</span>
                  {session.status === 'completed' && (
                    <span style={{ color: '#38a169' }}>
                      Score: {session.vocabularyScore}/{session.grammarScore}/{session.fluencyScore}/{session.culturalScore}/{session.taskScore}
                    </span>
                  )}
                </div>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#999' }}>
                  {new Date(session.startedAt).toLocaleDateString()}
                  {session.completedAt && ` — ${new Date(session.completedAt).toLocaleDateString()}`}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <Link href={`/chat/${session.scenarioId}?sessionId=${session.id}`} style={{ textDecoration: 'none' }}>
                  <button style={{
                    padding: '8px 16px', background: '#edf2f7', border: '1px solid #cbd5e0',
                    borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem'
                  }}>
                    View
                  </button>
                </Link>
                <button
                  onClick={() => handleShare(session.id)}
                  style={{
                    padding: '8px 12px', background: shareState[session.id] ? '#e6fffa' : '#fff',
                    border: '1px solid #cbd5e0', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem'
                  }}
                  title={shareState[session.id] ? 'Copied! Click to copy again' : 'Share this session'}
                >
                  {shareState[session.id] ? '🔗 Copied' : '🔗 Share'}
                </button>
                <button
                  onClick={() => handleDelete(session.id)}
                  disabled={deleting === session.id}
                  style={{
                    padding: '8px 12px', background: '#fff', color: '#e53e3e',
                    border: '1px solid #e53e3e', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem'
                  }}
                  title="Delete this session"
                >
                  {deleting === session.id ? '...' : '🗑️'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
    </>
  );
}
