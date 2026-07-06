'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { SharedSessionSkeleton } from '@/components/Skeleton';

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
        if (!res.ok) {
          const d = await res.json();
          throw new Error(d.error || 'Failed to load shared session');
        }
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
      <div style={{ maxWidth: '700px', margin: '40px auto', padding: '20px', fontFamily: 'sans-serif' }}>
        <SharedSessionSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ maxWidth: '700px', margin: '40px auto', padding: '20px', fontFamily: 'sans-serif' }}>
        <div style={{ padding: '20px', background: '#fff5f5', color: '#c53030', borderRadius: '8px', textAlign: 'center' }}>
          <h2 style={{ marginTop: 0 }}>Cannot Load Session</h2>
          <p>{error}</p>
          <p style={{ fontSize: '0.85rem', color: '#718096' }}>
            The share link may be invalid or the session may have been deleted.
          </p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { scenario, session, conversations, evaluation } = data;

  return (
    <div style={{ maxWidth: '700px', margin: '40px auto', padding: '20px', fontFamily: 'sans-serif' }}>
      <div style={{ textAlign: 'center', marginBottom: '30px' }}>
        <h1 style={{ fontSize: '1.6rem', margin: '0 0 5px 0' }}>🥋 AI DOJO — Shared Session</h1>
        <p style={{ color: '#718096', fontSize: '0.85rem', margin: 0 }}>
          <span style={{ background: '#ebf8ff', padding: '2px 8px', borderRadius: '4px', color: '#2b6cb0' }}>
            READ ONLY
          </span>
          {' '}You are viewing a shared role-play session. No account needed.
        </p>
      </div>

      <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px', marginBottom: '20px', background: '#f7fafc' }}>
        <h2 style={{ margin: '0 0 10px 0', fontSize: '1.3rem' }}>{scenario.title}</h2>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
          <span style={{ background: scenario.difficulty === 'beginner' ? '#e6fffa' : '#feebc8', padding: '3px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold' }}>
            {scenario.difficulty}
          </span>
          <span style={{ background: '#e2e8f0', padding: '3px 8px', borderRadius: '4px', fontSize: '0.8rem' }}>
            {scenario.domain}
          </span>
        </div>
        <p style={{ color: '#4a5568', fontSize: '0.9rem', margin: '8px 0' }}>{scenario.context}</p>
        <p style={{ fontSize: '0.85rem', color: '#718096', margin: '8px 0 0 0' }}>
          <strong>AI Character:</strong> {scenario.aiCharacterName} ({scenario.aiCharacterRole})
        </p>
        <p style={{ fontSize: '0.85rem', color: '#718096', margin: '4px 0 0 0' }}>
          <strong>You play:</strong> {scenario.userCharacterName} — {scenario.userCharacterRole}
        </p>
        <p style={{ fontSize: '0.8rem', color: '#a0aec0', margin: '12px 0 0 0' }}>
          Session #{session.sessionNumber} &middot; {session.totalTurns} turns &middot;
          {session.completedAt ? ` Completed ${new Date(session.completedAt).toLocaleDateString()}` : ' In progress'}
        </p>
      </div>

      <div style={{ minHeight: '300px', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', background: '#f7fafc' }}>
        <h3 style={{ marginTop: 0, color: '#2d3748', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>Conversation Transcript</h3>
        {conversations.length === 0 ? (
          <p style={{ color: '#a0aec0', textAlign: 'center' }}>No messages in this session.</p>
        ) : (
          conversations.map((msg: any, i: number) => (
            <div key={i} style={{ textAlign: msg.speaker === 'user' ? 'right' : 'left', margin: '15px 0' }}>
              <div style={{
                display: 'inline-block',
                background: msg.speaker === 'user' ? '#0070f3' : '#edf2f7',
                color: msg.speaker === 'user' ? '#fff' : '#2d3748',
                padding: '12px 16px',
                borderRadius: '14px',
                fontSize: '15px',
                maxWidth: '85%',
                textAlign: 'left'
              }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 'bold', textTransform: 'uppercase', opacity: 0.6, marginBottom: '4px' }}>
                  {msg.speaker === 'user' ? 'You' : scenario.aiCharacterName}
                  {msg.emotionTone && <span> &middot; {msg.emotionTone}</span>}
                </div>
                <strong>{msg.messageJp}</strong>
                {(msg.messageRomaji || msg.messageEn) && (
                  <div style={{ opacity: 0.8, fontSize: '12px', marginTop: '6px', borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: '6px' }}>
                    <i>{msg.messageRomaji}</i> <br /> {msg.messageEn}
                  </div>
                )}
                {msg.speaker === 'user' && msg.corrections?.length > 0 && (
                  <div style={{ marginTop: '8px' }}>
                    {msg.corrections.map((c: any, j: number) => (
                      <div key={j} style={{
                        padding: '6px 10px', background: msg.speaker === 'user' ? 'rgba(255,255,255,0.15)' : '#fffbea',
                        borderRadius: '6px', fontSize: '12px', marginTop: '4px',
                        color: msg.speaker === 'user' ? '#fff' : '#744210',
                        border: msg.speaker === 'user' ? '1px solid rgba(255,255,255,0.2)' : '1px solid #f6e05e'
                      }}>
                        <strong>Correction ({c.correctionType}):</strong> {c.explanation}
                      </div>
                    ))}
                  </div>
                )}
                {msg.gestureHint && (
                  <div style={{ fontSize: '11px', fontStyle: 'italic', opacity: 0.6, marginTop: '4px' }}>
                    🎭 {msg.gestureHint}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {evaluation && (
        <div style={{ background: '#f0fff4', border: '1px solid #38a169', padding: '24px', borderRadius: '12px', marginTop: '20px' }}>
          <h3 style={{ color: '#22543d', marginTop: 0, borderBottom: '1px solid #c6f6d5', paddingBottom: '8px' }}>📊 Performance Evaluation</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', margin: '15px 0' }}>
            <p style={{ margin: 0 }}><strong>Vocabulary:</strong> {evaluation.vocabularyScore}/30</p>
            <p style={{ margin: 0 }}><strong>Grammar:</strong> {evaluation.grammarScore}/25</p>
            <p style={{ margin: 0 }}><strong>Fluency:</strong> {evaluation.fluencyScore}/20</p>
            <p style={{ margin: 0 }}><strong>Cultural:</strong> {evaluation.culturalScore}/15</p>
            <p style={{ margin: 0 }}><strong>Task:</strong> {evaluation.taskScore}/10</p>
          </div>
          <div style={{ background: '#fff', padding: '16px', borderRadius: '6px', borderLeft: '4px solid #38a169' }}>
            <strong>AI Sensei Feedback:</strong> {evaluation.feedback}
          </div>
        </div>
      )}
    </div>
  );
}
