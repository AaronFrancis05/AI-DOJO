'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth/client';
import PasswordInput from '@/components/PasswordInput';
import ForgotPasswordModal from '@/components/ForgotPasswordModal';
import { MailIcon, UserIcon, LoaderIcon, AlertCircleIcon, GoogleLogo } from '@/components/Icons';

export default function AuthPage() {
  const router = useRouter();

  useEffect(() => {
    authClient.getSession().then(({ data }) => {
      if (data?.user) router.push('/dashboard');
    });
  }, [router]);

  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { error: authError } = isLogin
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({
            email,
            password,
            name,
          });

      if (authError) {
        setError(authError.message || 'Something went wrong');
        return;
      }

      void consent;

      if (isLogin) {
        router.push('/dashboard');
      } else {
        router.push(`/auth/verify-email?email=${encodeURIComponent(email)}`);
      }
      router.refresh();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleGoogleAuth() {
    window.location.href = '/api/auth/google/init';
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-900 text-2xl">
            🥋
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">AI DOJO</h1>
          <p className="mt-1.5 text-sm text-neutral-500">
            {isLogin ? 'Welcome back — let\u2019s keep training.' : 'Create your account to start training.'}
          </p>
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-6 flex rounded-lg bg-neutral-100 p-1">
            {(['login', 'register'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  setIsLogin(mode === 'login');
                  setError('');
                }}
                className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                  (mode === 'login') === isLogin
                    ? 'bg-white text-neutral-900 shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                {mode === 'login' ? 'Log in' : 'Register'}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleGoogleAuth}
            className="flex w-full items-center justify-center gap-3 rounded-lg border border-neutral-300 bg-white py-3 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
          >
            <GoogleLogo />
            Continue with Google
          </button>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-neutral-200" />
            <span className="text-xs uppercase tracking-wide text-neutral-400">or</span>
            <div className="h-px flex-1 bg-neutral-200" />
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {!isLogin && (
              <div className="relative">
                <UserIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                  className="w-full rounded-lg border border-neutral-300 bg-white py-3 pl-10 pr-3 text-[15px] outline-none transition focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10"
                />
              </div>
            )}

            <div className="relative">
              <MailIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full rounded-lg border border-neutral-300 bg-white py-3 pl-10 pr-3 text-[15px] outline-none transition focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10"
              />
            </div>

            <PasswordInput
              value={password}
              onChange={setPassword}
              placeholder={isLogin ? 'Password' : 'Password (min 6 characters)'}
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              minLength={6}
              showStrength={!isLogin}
            />

            {isLogin && (
              <button
                type="button"
                onClick={() => setShowForgotPassword(true)}
                className="-mt-2 self-end text-sm font-medium text-neutral-500 transition hover:text-neutral-900"
              >
                Forgot password?
              </button>
            )}

            {!isLogin && (
              <label className="flex items-start gap-2.5 text-sm text-neutral-600">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900/20"
                />
                Allow anonymized conversation data to be used to improve AI Japanese-learning tools
              </label>
            )}

            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
                <AlertCircleIcon className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-1 flex items-center justify-center gap-2 rounded-lg bg-neutral-900 py-3 text-[15px] font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading && <LoaderIcon className="h-4 w-4" />}
              {loading ? 'Please wait…' : isLogin ? 'Log in' : 'Create account'}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-neutral-500">
          {isLogin ? "Don't have an account? " : 'Already have an account? '}
          <button
            type="button"
            onClick={() => setIsLogin(!isLogin)}
            className="font-medium text-neutral-900 underline underline-offset-2"
          >
            {isLogin ? 'Register' : 'Log in'}
          </button>
        </p>
      </div>

      {showForgotPassword && (
        <ForgotPasswordModal onClose={() => setShowForgotPassword(false)} />
      )}
    </div>
  );
}
