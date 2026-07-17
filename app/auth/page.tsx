'use client';

import Image from 'next/image';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth/client';
import PasswordInput from '@/components/PasswordInput';
import ForgotPasswordModal from '@/components/ForgotPasswordModal';
import { MailIcon, UserIcon, LoaderIcon, AlertCircleIcon, GoogleLogo, Trophy } from '@/components/Icons';
import { Mic2, Star, BarChart3, Zap } from 'lucide-react';
import Link from 'next/link';

export default function AuthPage() {
  const router = useRouter();

  useEffect(() => {
    authClient.getSession().then(({ data }) => {
      if (data?.user) router.push('/home');
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
        router.push('/home');
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
    <div className="flex h-dvh w-screen overflow-hidden bg-dojo-canvas">
      {/* LEFT COLUMN (FORM PANEL) */}
      <div className="flex w-full flex-col overflow-y-auto bg-dojo-sidebar lg:w-[480px] shrink-0">
        <div className="flex items-center justify-between border-b border-dojo-border px-8 py-5">
          <div className="text-lg font-bold text-dojo-text-primary">
            <Link href="/">🥋 AI DOJO</Link>
          </div>
          {isLogin ? (
            <div className="text-sm text-dojo-text-muted">
              Don&apos;t have an account?{' '}
              <button
                onClick={() => setIsLogin(false)}
                className="font-semibold text-dojo-accent hover:underline"
              >
                Register
              </button>
            </div>
          ) : (
            <div className="text-sm text-dojo-text-muted">
              Already have an account?{' '}
              <button
                onClick={() => setIsLogin(true)}
                className="font-semibold text-dojo-accent hover:underline"
              >
                Log in
              </button>
            </div>
          )}
        </div>

        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-8 py-10">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-dojo-text-primary">
              {isLogin ? 'Welcome Back! 👋' : 'Create Your Account'}
            </h1>
            <p className="mt-1 text-sm text-dojo-text-muted">
              {isLogin ? 'Continue your language journey.' : 'Start your AI-powered language journey.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-dojo-text-muted">Full name</label>
                <input
                  type="text"
                  placeholder="Alex Kim"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full rounded-lg border border-dojo-border bg-dojo-surface px-4 py-3 text-sm text-dojo-text-primary outline-none transition placeholder:text-dojo-text-muted/50 focus:border-dojo-accent focus:ring-2 focus:ring-dojo-accent/20"
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-dojo-text-muted">Email address</label>
              <input
                type="email"
                placeholder="alex@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-lg border border-dojo-border bg-dojo-surface px-4 py-3 text-sm text-dojo-text-primary outline-none transition placeholder:text-dojo-text-muted/50 focus:border-dojo-accent focus:ring-2 focus:ring-dojo-accent/20"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-dojo-text-muted">Password</label>
              <PasswordInput
                value={password}
                onChange={setPassword}
                placeholder={isLogin ? 'Password' : 'Password (min 6 characters)'}
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                minLength={6}
                showStrength={!isLogin}
              />
            </div>

            {!isLogin && (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-dojo-text-muted">Confirm password</label>
                <PasswordInput
                  value={password}
                  onChange={() => {}}
                  placeholder="Confirm password"
                  autoComplete="new-password"
                />
              </div>
            )}

            {isLogin ? (
              <div className="mt-1 flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-dojo-text-muted cursor-pointer">
                  <input type="checkbox" className="accent-dojo-accent" />
                  Remember me
                </label>
                <button
                  type="button"
                  onClick={() => setShowForgotPassword(true)}
                  className="text-sm text-dojo-accent hover:underline"
                >
                  Forgot password?
                </button>
              </div>
            ) : (
              <label className="flex items-start gap-2.5 text-sm text-dojo-text-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5 accent-dojo-accent"
                />
                <span>
                  I agree to the{' '}
                  <button type="button" className="text-dojo-accent underline">Terms of Service</button> and{' '}
                  <button type="button" className="text-dojo-accent underline">Privacy Policy</button>
                </span>
              </label>
            )}

            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-dojo-danger/30 bg-dojo-danger/10 px-3 py-2.5 text-sm text-dojo-danger">
                <AlertCircleIcon className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-dojo-accent py-3 font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {loading && <LoaderIcon className="h-4 w-4 animate-spin" />}
              {loading ? 'Please wait…' : isLogin ? 'Log in' : 'Create Account'}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-dojo-border" />
            <span className="text-xs text-dojo-text-muted">or continue with</span>
            <div className="h-px flex-1 bg-dojo-border" />
          </div>

          <div className="space-y-3">
            <button
              type="button"
              onClick={handleGoogleAuth}
              className="flex w-full items-center justify-center gap-3 rounded-lg border border-dojo-border bg-dojo-surface py-3 text-sm font-medium text-dojo-text-primary transition-colors hover:bg-dojo-surface-raised"
            >
              <GoogleLogo />
              Continue with Google
            </button>
          </div>

          <p className="mt-6 text-center text-xs text-dojo-text-muted">
            By continuing, you agree to our{' '}
            <span className="cursor-pointer text-dojo-accent underline">Terms of Service</span> and{' '}
            <span className="cursor-pointer text-dojo-accent underline">Privacy Policy</span>.
          </p>
        </div>
      </div>

      {/* RIGHT COLUMN — DECORATIVE PANEL */}
      <div className="relative hidden flex-1 overflow-hidden lg:flex flex-col">
        {isLogin ? (
          <>
            <Image
              src="/avatar.png"
              fill
              className="object-cover object-top"
              alt=""
              priority
              sizes="(max-width: 1024px) 100vw, 480px"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-dojo-canvas via-dojo-canvas/40 to-transparent" />
            <div className="absolute inset-0 bg-dojo-canvas/20" />

            <div className="absolute inset-0 z-10 flex flex-col justify-between p-10">
              {/* TOP — Japanese greeting */}
              <div className="ml-auto max-w-xs rounded-2xl rounded-tr-none border border-dojo-border bg-dojo-surface-raised/90 p-4 shadow-xl backdrop-blur-md">
                <div className="text-sm font-medium leading-relaxed text-dojo-text-primary">
                  おかえり！
                </div>
                <div className="mt-1 text-xs text-dojo-text-muted">Welcome back!</div>
                <div className="my-2 h-px bg-dojo-border" />
                <div className="text-sm font-medium text-dojo-text-primary">
                  今日も一緒に頑張りましょう！
                </div>
                <div className="mt-1 text-xs text-dojo-text-muted">Let&apos;s do our best today!</div>
              </div>

              
            </div>
          </>
        ) : (
          <>
            <Image
              src="/background.png"
              fill
              className="object-cover"
              alt=""
              priority
              sizes="(max-width: 1024px) 100vw, 50vw"
            />
            <div className="absolute inset-0 bg-gradient-to-br from-dojo-canvas/95 via-dojo-canvas/40 to-dojo-canvas/80" />

            <div className="absolute inset-0 z-10 flex flex-col justify-center p-12">
              <div className="mb-8">
                <h2 className="text-3xl font-bold leading-tight text-dojo-text-primary">Your Adventure Awaits</h2>
                <p className="mt-3 text-base leading-relaxed text-dojo-text-muted">
                  Practice speaking with AI characters in immersive real-world scenarios.
                </p>
              </div>

              <div className="mb-12 space-y-4">
                {[
                  { icon: <Mic2 className="h-4 w-4 text-dojo-accent" />, text: 'Real-time voice conversations' },
                  { icon: <Star className="h-4 w-4 text-dojo-accent" />, text: 'Personalized feedback' },
                  { icon: <BarChart3 className="h-4 w-4 text-dojo-accent" />, text: 'Track your progress' },
                  { icon: <Zap className="h-4 w-4 text-dojo-accent" />, text: 'Learn at your own pace' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-dojo-accent/30 bg-dojo-accent/20 text-dojo-accent">
                      {item.icon}
                    </div>
                    <span className="text-sm font-medium text-dojo-text-primary">{item.text}</span>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-4">
                <div className="flex -space-x-2">
                  {['S', 'J', 'M'].map((l) => (
                    <div key={l} className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-dojo-sidebar bg-dojo-accent/30 text-xs font-bold text-dojo-accent">
                      {l}
                    </div>
                  ))}
                </div>
                <div className="ml-3">
                  <div className="text-sm font-semibold text-dojo-text-primary">50,000+</div>
                  <div className="text-xs text-dojo-text-muted">learners already joined</div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {showForgotPassword && (
        <ForgotPasswordModal onClose={() => setShowForgotPassword(false)} />
      )}
    </div>
  );
}
