'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { TypingIndicator, ChatPageSkeleton, ChatPageShell } from '@/components/Skeleton';

interface ChatBubble {
  sender: 'user' | 'ai';
  text: string;
  romaji?: string;
  english?: string;
  teachingNote?: string;
  gestureHint?: string;
}

interface ScenarioDetails {
  title: string;
  context: string;
  aiCharacterName: string;
  aiCharacterRole: string;
  userCharacterName: string;
  userCharacterRole: string;
  learningGoals: string;
}

export default function AI_Dojo_Chatroom() {
  const params = useParams();
  const router = useRouter();
  const scenarioId = Number(params.id);

  const [scenario, setScenario] = useState<ScenarioDetails | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [sessionStatus, setSessionStatus] = useState<string>('active');
  const [messages, setMessages] = useState<ChatBubble[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [initLoading, setInitLoading] = useState(true);
  const [finalEvaluation, setFinalEvaluation] = useState<any | null>(null);
  const [error, setError] = useState('');
  const [shareLink, setShareLink] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Get sessionId from URL query param via window.location
  const sessionIdFromUrl = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('sessionId')
    : null;

  const startNewSession = useCallback(async () => {
    const sesRes = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenarioId }),
    });
    const sesData = await sesRes.json();
    if (sesData.success) {
      return sesData.session;
    }
    throw new Error(sesData.error || 'Failed to create session');
  }, [scenarioId]);

  const loadExistingSession = useCallback(async (sid: number) => {
    const res = await fetch(`/api/sessions/${sid}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to load session');
    return data;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const scRes = await fetch(`/api/scenario/${scenarioId}`);
        const scData = await scRes.json();
        if (!scData.success) {
          setError('Scenario not found');
          setInitLoading(false);
          return;
        }

        if (cancelled) return;
        setScenario(scData.scenario);

        if (sessionIdFromUrl) {
          // Load existing session
          const data = await loadExistingSession(Number(sessionIdFromUrl));
          if (cancelled) return;
          setSessionId(data.session.id);
          setSessionStatus(data.session.status);

          // Convert conversation history to ChatBubble
          const history: ChatBubble[] = [];
          for (const conv of data.conversations || []) {
            const bubble: ChatBubble = {
              sender: conv.speaker,
              text: conv.messageJp,
              romaji: conv.messageRomaji,
              english: conv.messageEn,
              gestureHint: conv.gestureHint,
            };
            if (conv.speaker === 'ai') {
              const notes = conv.corrections?.map((c: any) => c.explanation).join('; ');
              if (notes) bubble.teachingNote = notes;
            }
            history.push(bubble);
          }

          setMessages(history);

          if (data.evaluation) {
            setFinalEvaluation(data.evaluation);
          }
        } else {
          // Check for active session to resume
          const activeRes = await fetch(`/api/sessions?scenarioId=${scenarioId}&status=active`);
          const activeData = await activeRes.json();
          const activeSession = activeData.success && activeData.sessions.length > 0
            ? activeData.sessions[0]
            : null;

          if (activeSession) {
            // Resume active session
            const data = await loadExistingSession(activeSession.id);
            if (cancelled) return;
            setSessionId(data.session.id);
            setSessionStatus(data.session.status);

            const history: ChatBubble[] = [];
            for (const conv of data.conversations || []) {
              const bubble: ChatBubble = {
                sender: conv.speaker,
                text: conv.messageJp,
                romaji: conv.messageRomaji,
                english: conv.messageEn,
                gestureHint: conv.gestureHint,
              };
              if (conv.speaker === 'ai') {
                const notes = conv.corrections?.map((c: any) => c.explanation).join('; ');
                if (notes) bubble.teachingNote = notes;
              }
              history.push(bubble);
            }
            setMessages(history);
          } else {
            // Start new session
            const session = await startNewSession();
            if (cancelled) return;
            setSessionId(session.id);

            setMessages([
              {
                sender: 'ai',
                text: `こんにちは！私は${scData.scenario.aiCharacterName}です。`,
                romaji: `Konnichiwa! Watashi wa ${scData.scenario.aiCharacterName} desu.`,
                english: `Hello! I am ${scData.scenario.aiCharacterName}.`
              }
            ]);
          }
        }
      } catch (err: any) {
        setError(err.message || 'Failed to initialize');
      } finally {
        if (!cancelled) setInitLoading(false);
      }
    }
    init();

    return () => { cancelled = true; };
  }, [scenarioId, router, startNewSession, loadExistingSession, sessionIdFromUrl]);

  async function handleNewSession() {
    setInitLoading(true);
    setError('');
    setFinalEvaluation(null);
    setMessages([]);
    setShareLink('');

    try {
      const session = await startNewSession();
      setSessionId(session.id);
      setSessionStatus('active');
      setMessages([
        {
          sender: 'ai',
          text: `こんにちは！私は${scenario?.aiCharacterName}です。`,
          romaji: `Konnichiwa! Watashi wa ${scenario?.aiCharacterName} desu.`,
          english: `Hello! I am ${scenario?.aiCharacterName}.`
        }
      ]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setInitLoading(false);
    }
  }

  async function handleShare() {
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/sessions/${sessionId}/share`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        const link = `${window.location.origin}/share/${data.token}`;
        setShareLink(link);
        navigator.clipboard.writeText(link).catch(() => {});
      }
    } catch (e) {
      console.error('Share failed:', e);
    }
  }

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || loading || !sessionId) return;
    if (sessionStatus !== 'active') return;

    setLoading(true);
    setError('');
    const dynamicUserTurn = inputMessage;
    setMessages(prev => [...prev, { sender: 'user', text: dynamicUserTurn }]);
    setInputMessage('');

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, userRawInputJp: dynamicUserTurn }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Request failed (${response.status})`);
      }

      setMessages(prev => {
        const base = [...prev];
        base[base.length - 1] = {
          sender: 'user',
          text: dynamicUserTurn,
          romaji: data.analysis.messageRomaji,
          english: data.analysis.messageEn
        };
        return base;
      });

      if (!data.analysis.isValidInContext) {
        setMessages(prev => [
          ...prev,
          {
            sender: 'ai',
            text: `⚠️ [Off-context note: Your response doesn't match your character's situation. As ${data.analysis.scenarioUserRole || 'your character'}, please stay within the scenario.]`,
          }
        ]);
      }

      const teachingNote = data.analysis.corrections?.length > 0
        ? data.analysis.corrections.map((c: any) => c.explanation).join('; ')
        : (data.analysis.teachingNote || '');

      setMessages(prev => [
        ...prev,
        {
          sender: 'ai',
          text: data.analysis.nextAiReply.japanese,
          romaji: data.analysis.nextAiReply.romaji,
          english: data.analysis.nextAiReply.english,
          teachingNote,
        }
      ]);

      if (data.analysis.scenarioComplete) {
        setFinalEvaluation(data.analysis);
        setSessionStatus('completed');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to send message');
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  };

  if (initLoading) {
    return <ChatPageSkeleton />;
  }

  if (error && !scenario) {
    return (
      <ChatPageShell>
        <p style={{ color: '#c53030', background: '#fff5f5', padding: '16px', borderRadius: '8px' }}>{error}</p>
        <button onClick={() => router.push('/dashboard')} style={{ background: '#000', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer' }}>
          Back to Scenarios
        </button>
      </ChatPageShell>
    );
  }

  if (!scenario) return null;

  const isReadOnly = sessionStatus !== 'active';

  async function handleDelete() {
    if (!sessionId || !confirm('Delete this session? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
      if (res.ok) router.push('/dashboard');
    } catch (e) {
      console.error('Delete failed:', e);
    }
  }

  return (
    <ChatPageShell>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <button onClick={() => router.push('/dashboard')} style={{ background: 'none', border: 'none', color: '#0070f3', cursor: 'pointer', fontSize: '1rem' }}>
          &larr; Back to Role-plays
        </button>
        <div style={{ display: 'flex', gap: '8px' }}>
          {sessionId && (
            <button onClick={handleShare} style={{
              padding: '6px 12px', background: shareLink ? '#e6fffa' : '#fff',
              border: '1px solid #cbd5e0', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem'
            }}>
              {shareLink ? '🔗 Copied' : '🔗 Share'}
            </button>
          )}
          {sessionId && (
            <button onClick={handleDelete} style={{
              padding: '6px 12px', background: '#fff', color: '#e53e3e',
              border: '1px solid #e53e3e', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem'
            }}>
              🗑️
            </button>
          )}
          <button onClick={handleNewSession} style={{
            padding: '6px 12px', background: '#000', color: '#fff',
            border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem'
          }}>
            + New Session
          </button>
        </div>
      </div>

      <h2 style={{ borderBottom: '2px solid #333', paddingBottom: '10px', margin: '0 0 5px 0' }}>{scenario.title}</h2>
      <p style={{ color: '#666', fontSize: '0.9rem', margin: '0 0 5px 0' }}>
        Role-play character: <strong>{scenario.aiCharacterName}</strong> &mdash; {scenario.aiCharacterRole}
      </p>
      <p style={{ color: '#2b6cb0', fontSize: '0.85rem', margin: '0 0 20px 0', background: '#ebf8ff', padding: '8px 12px', borderRadius: '6px', border: '1px solid #bee3f8' }}>
        <strong>You are:</strong> {scenario.userCharacterName} &mdash; {scenario.userCharacterRole}
        {isReadOnly && <span style={{ marginLeft: '10px', color: '#c53030' }}>(Read-only — session completed)</span>}
      </p>

      {error && (
        <div style={{ padding: '10px', background: '#fff5f5', color: '#c53030', borderRadius: '6px', marginBottom: '10px', fontSize: '0.9rem' }}>
          {error}
        </div>
      )}

      <div style={{ minHeight: '350px', background: '#f7fafc', padding: '20px', borderRadius: '12px', margin: '20px 0', border: '1px solid #e2e8f0', maxHeight: '500px', overflowY: 'auto' }}>
        {messages.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#a0aec0' }}>No messages in this session.</p>
        ) : (
          messages.map((msg, i) => (
            <div key={i} style={{ textAlign: msg.sender === 'user' ? 'right' : 'left', margin: '15px 0' }}>
              <div style={{
                display: 'inline-block',
                background: msg.sender === 'user' ? '#0070f3' : '#edf2f7',
                color: msg.sender === 'user' ? '#fff' : '#2d3748',
                padding: '12px 16px',
                borderRadius: '14px',
                fontSize: '16px',
                maxWidth: '80%',
                textAlign: 'left'
              }}>
                <strong>{msg.text}</strong>
                {(msg.romaji || msg.english) && (
                  <div style={{ opacity: 0.8, fontSize: '12px', marginTop: '6px', borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: '6px' }}>
                    <i>{msg.romaji}</i> <br /> {msg.english}
                  </div>
                )}
                {msg.gestureHint && (
                  <div style={{ fontSize: '11px', fontStyle: 'italic', opacity: 0.6, marginTop: '4px' }}>
                    🎭 {msg.gestureHint}
                  </div>
                )}
                {msg.sender === 'ai' && msg.teachingNote && (
                  <div style={{ marginTop: '8px', padding: '8px 10px', background: '#fffbea', borderRadius: '8px', border: '1px solid #f6e05e', fontSize: '13px', color: '#744210' }}>
                    <strong>💡 Language Tip:</strong> {msg.teachingNote}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        {loading && (
          <div style={{ textAlign: 'left', margin: '15px 0' }}>
            <TypingIndicator />
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {!finalEvaluation && !isReadOnly ? (
        <div style={{ display: 'flex', gap: '10px' }}>
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder={`Respond to ${scenario.aiCharacterName} in Japanese...`}
            style={{ flex: 1, padding: '14px', fontSize: '15px', borderRadius: '6px', border: '1px solid #cbd5e0' }}
            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
            disabled={loading || !sessionId}
          />
          <button
            onClick={handleSendMessage}
            disabled={loading || !sessionId}
            style={{ padding: '0 28px', background: '#000', color: '#fff', border: 'none', borderRadius: '6px', cursor: loading || !sessionId ? 'not-allowed' : 'pointer', fontWeight: 'bold', opacity: loading || !sessionId ? 0.6 : 1 }}
          >
            {loading ? 'Processing...' : 'Send'}
          </button>
        </div>
      ) : isReadOnly && !finalEvaluation ? (
        <div style={{ textAlign: 'center', padding: '16px', background: '#fffbeb', borderRadius: '8px', border: '1px solid #f6e05e', color: '#744210' }}>
          This session is no longer active. Start a new session to continue practising.
        </div>
      ) : null}

      {(finalEvaluation || (isReadOnly && messages.length > 0)) && (
        <div style={{ background: '#f0fff4', border: '1px solid #38a169', padding: '24px', borderRadius: '12px', marginTop: '20px' }}>
          <h3 style={{ color: '#22543d', marginTop: 0, borderBottom: '1px solid #c6f6d5', paddingBottom: '8px' }}>📊 Performance Evaluation</h3>
          {finalEvaluation ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', margin: '15px 0' }}>
                <p style={{ margin: 0 }}><strong>Vocabulary:</strong> {finalEvaluation.scores?.vocabulary ?? finalEvaluation.vocabularyScore}/30</p>
                <p style={{ margin: 0 }}><strong>Grammar:</strong> {finalEvaluation.scores?.grammar ?? finalEvaluation.grammarScore}/25</p>
                <p style={{ margin: 0 }}><strong>Fluency:</strong> {finalEvaluation.scores?.fluency ?? finalEvaluation.fluencyScore}/20</p>
                <p style={{ margin: 0 }}><strong>Cultural Rapport:</strong> {finalEvaluation.scores?.cultural ?? finalEvaluation.culturalScore}/15</p>
                <p style={{ margin: 0 }}><strong>Task Target:</strong> {finalEvaluation.scores?.task ?? finalEvaluation.taskScore}/10</p>
              </div>
              <div style={{ background: '#fff', padding: '16px', borderRadius: '6px', borderLeft: '4px solid #38a169' }}>
                <strong>AI Sensei Feedback:</strong> {finalEvaluation.feedback}
              </div>
            </>
          ) : (
            <p style={{ color: '#718096' }}>No evaluation available for this session.</p>
          )}
        </div>
      )}
    </ChatPageShell>
  );
}
