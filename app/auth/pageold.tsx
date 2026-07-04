'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AuthPage() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
      const body: any = { email, password };
      if (!isLogin) {
        body.name = name;
        body.consentToDataSharing = consent;
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Something went wrong');
        return;
      }

      router.push('/');
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: '420px', margin: '60px auto', padding: '20px', fontFamily: 'sans-serif' }}>
      <h1 style={{ textAlign: 'center', fontSize: '2rem', marginBottom: '8px' }}>🥋 AI DOJO</h1>
      <p style={{ textAlign: 'center', color: '#666', marginBottom: '30px' }}>
        {isLogin ? 'Welcome back' : 'Create your account'}
      </p>

      <div style={{ display: 'flex', marginBottom: '24px', background: '#f0f0f0', borderRadius: '8px', overflow: 'hidden' }}>
        <button
          onClick={() => { setIsLogin(true); setError(''); }}
          style={{
            flex: 1, padding: '10px', border: 'none', cursor: 'pointer',
            background: isLogin ? '#000' : 'transparent',
            color: isLogin ? '#fff' : '#333', fontWeight: 'bold', fontSize: '1rem'
          }}
        >
          Login
        </button>
        <button
          onClick={() => { setIsLogin(false); setError(''); }}
          style={{
            flex: 1, padding: '10px', border: 'none', cursor: 'pointer',
            background: !isLogin ? '#000' : 'transparent',
            color: !isLogin ? '#fff' : '#333', fontWeight: 'bold', fontSize: '1rem'
          }}
        >
          Register
        </button>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {!isLogin && (
          <input
            type="text"
            placeholder="Your name"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            style={{ padding: '12px', borderRadius: '6px', border: '1px solid #cbd5e0', fontSize: '1rem' }}
          />
        )}

        <input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          style={{ padding: '12px', borderRadius: '6px', border: '1px solid #cbd5e0', fontSize: '1rem' }}
        />

        <input
          type="password"
          placeholder="Password (min 6 characters)"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          minLength={6}
          style={{ padding: '12px', borderRadius: '6px', border: '1px solid #cbd5e0', fontSize: '1rem' }}
        />

        {!isLogin && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', color: '#555' }}>
            <input
              type="checkbox"
              checked={consent}
              onChange={e => setConsent(e.target.checked)}
              style={{ width: '18px', height: '18px' }}
            />
            Allow anonymized conversation data to be used to improve AI Japanese-learning tools
          </label>
        )}

        {error && (
          <div style={{ padding: '10px', background: '#fff5f5', color: '#c53030', borderRadius: '6px', fontSize: '0.9rem' }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '14px', background: '#000', color: '#fff', border: 'none',
            borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem'
          }}
        >
          {loading ? 'Please wait...' : (isLogin ? 'Login' : 'Create Account')}
        </button>
      </form>
    </div>
  );
}
