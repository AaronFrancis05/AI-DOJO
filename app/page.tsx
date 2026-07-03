'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface Scenario {
  id: number;
  title: string;
  context: string;
  difficulty: string;
  domain: string;
  learningGoals: string;
  aiCharacterName: string;
  aiCharacterRole: string;
  userCharacterName: string;
  userCharacterRole: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [roleplays, setRoleplays] = useState<Scenario[]>([]);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      const meRes = await fetch('/api/auth/me');
      if (meRes.ok) {
        const meData = await meRes.json();
        setUser(meData.user);
      } else {
        router.push('/auth');
        return;
      }

      const res = await fetch('/api/scenarios');
      const data = await res.json();
      if (data.success) {
        setRoleplays(data.scenarios);
      }

      setLoading(false);
    }
    init();
  }, [router]);

  // Server-side data fetching for scenarios - use a simple fetch for all scenarios
  // For now the scenarios are loaded from a simple API call
  useEffect(() => {
    async function loadScenarios() {
      try {
        const res = await fetch('/api/scenarios');
        const data = await res.json();
        if (data.success) {
          setRoleplays(data.scenarios);
        }
      } catch (e) {
        console.error('Failed to load scenarios:', e);
      }
    }
    loadScenarios();
  }, []);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/auth');
  }

  async function startSession(scenarioId: number) {
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarioId }),
      });
      const data = await res.json();
      if (data.success) {
        router.push(`/chat/${scenarioId}?sessionId=${data.session.id}`);
      }
    } catch (e) {
      console.error('Failed to start session:', e);
    }
  }

  if (loading) return <div style={{ textAlign: 'center', padding: '50px' }}>Loading...</div>;

  return (
    <div style={{ maxWidth: '1000px', margin: '40px auto', padding: '20px', fontFamily: 'sans-serif' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
        <div>
          <h1 style={{ fontSize: '2.5rem', color: '#1a202c', marginBottom: '10px' }}>🥋 AI DOJO — Interactive Japanese Arena</h1>
          <p style={{ color: '#4a5568', fontSize: '1.1rem' }}>
            Select a real-world scenario below to begin your personalized, dynamic AI role-play session.
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          {user && <p style={{ margin: '0 0 8px 0', color: '#666', fontSize: '0.9rem' }}>👤 {user.name}</p>}
          <div style={{ display: 'flex', gap: '8px' }}>
            <Link href="/sessions" style={{ textDecoration: 'none' }}>
              <button style={{ padding: '8px 16px', background: '#edf2f7', border: '1px solid #cbd5e0', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem' }}>
                My Sessions
              </button>
            </Link>
            <button onClick={handleLogout} style={{ padding: '8px 16px', background: '#fff', border: '1px solid #cbd5e0', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem' }}>
              Logout
            </button>
          </div>
        </div>
      </header>

      {roleplays.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', background: '#fff5f5', color: '#c53030', borderRadius: '8px' }}>
          <strong>No scenarios found!</strong> Make sure you have run <code>npm run db:seed</code> to populate your database.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
          {roleplays.map((scenario) => (
            <div
              key={scenario.id}
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '24px',
                background: '#fff',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}
            >
              <div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                  <span style={{
                    background: scenario.difficulty === 'beginner' ? '#e6fffa' : '#feebc8',
                    color: scenario.difficulty === 'beginner' ? '#234e52' : '#744210',
                    padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold', textTransform: 'uppercase'
                  }}>
                    {scenario.difficulty}
                  </span>
                  <span style={{
                    background: '#ebf4ff', color: '#2b6cb0',
                    padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem'
                  }}>
                    {scenario.domain}
                  </span>
                </div>

                <h3 style={{ fontSize: '1.3rem', margin: '0 0 8px 0', color: '#2d3748' }}>{scenario.title}</h3>
                <p style={{ color: '#718096', fontSize: '0.9rem', lineHeight: '1.5', height: '90px', overflow: 'hidden' }}>
                  {scenario.context}
                </p>

                <div style={{ fontSize: '0.85rem', color: '#4a5568', background: '#f7fafc', padding: '10px', borderRadius: '6px', marginTop: '10px' }}>
                  <strong>🎯 Goal:</strong> {scenario.learningGoals}
                </div>
              </div>

              <button onClick={() => startSession(scenario.id)} style={{
                width: '100%',
                background: '#000',
                color: '#fff',
                border: 'none',
                padding: '12px',
                borderRadius: '6px',
                marginTop: '20px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '1rem'
              }}>
                Enter Dojo &rarr;
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
