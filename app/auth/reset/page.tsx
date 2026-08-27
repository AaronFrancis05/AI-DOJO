'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authClient } from '@/lib/auth/client';
import { getAuthErrorMessage } from '@/lib/auth/errors';
import PasswordInput from '@/components/PasswordInput';
import ForgotPasswordModal from '@/components/ForgotPasswordModal';
import { LoaderIcon, AlertCircleIcon, CheckCircleIcon } from '@/components/Icons';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  // Neon Auth validates the emailed link itself and bounces here with
  // ?error=INVALID_TOKEN (expired, already used, or tampered with) instead of
  // a token. Without reading it, a spent link renders a working-looking form
  // that only fails once the learner has typed a new password twice.
  const linkError = searchParams.get('error');
  const linkIsUsable = Boolean(token) && !linkError;

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    try {
      const { error: resetError } = await authClient.resetPassword({
        newPassword: password,
        token,
      });
      if (resetError) {
        setError(getAuthErrorMessage(resetError, 'This link may have expired. Request a new one.', 'reset'));
        return;
      }
      setDone(true);
      setTimeout(() => router.push('/auth/signin'), 2000);
    } catch (err) {
      setError(getAuthErrorMessage(err, 'Network error. Please try again.', 'reset'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-dojo-canvas px-4 py-12">
      <div className="w-full max-w-sm rounded-2xl border border-dojo-border bg-dojo-surface p-6 shadow-sm sm:p-8">
        {done ? (
          <div className="flex flex-col items-center py-2 text-center">
            <CheckCircleIcon className="h-10 w-10 text-dojo-success" />
            <h2 className="mt-3 text-lg font-bold text-dojo-text-primary">Password updated</h2>
            <p className="mt-1 text-sm text-dojo-text-muted">Redirecting you to log in…</p>
          </div>
        ) : !linkIsUsable ? (
          <div className="flex flex-col items-center py-2 text-center">
            <AlertCircleIcon className="h-10 w-10 text-dojo-danger" />
            <h2 className="mt-3 text-lg font-bold text-dojo-text-primary">This link no longer works</h2>
            <p className="mt-1 text-sm text-dojo-text-muted leading-relaxed">
              Reset links can only be used once and expire an hour after they&apos;re sent.
              Request a fresh one and we&apos;ll email it straight over.
            </p>
            <button
              type="button"
              onClick={() => setShowForgotPassword(true)}
              className="mt-4 w-full rounded-lg bg-dojo-accent px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              Request a new link
            </button>
            <Link
              href="/auth/signin"
              className="mt-3 text-sm font-medium text-dojo-accent hover:underline"
            >
              Back to log in
            </Link>
          </div>
        ) : (
          <>
            <h1 className="text-lg font-bold text-dojo-text-primary">Set a new password</h1>
            <p className="mt-1 text-sm text-dojo-text-muted leading-relaxed">
              Choose a new password for your account.
            </p>
            <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3">
              <PasswordInput
                value={password}
                onChange={setPassword}
                placeholder="New password"
                autoComplete="new-password"
                minLength={6}
                showStrength
              />
              <PasswordInput
                value={confirm}
                onChange={setConfirm}
                placeholder="Confirm new password"
                autoComplete="new-password"
                minLength={6}
              />
              {error && (
                <div className="flex items-center gap-2 rounded-lg border border-dojo-danger/30 bg-dojo-danger/10 px-3 py-2.5 text-sm text-dojo-danger">
                  <AlertCircleIcon className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={loading}
                className="mt-1 flex items-center justify-center gap-2 rounded-lg bg-dojo-accent px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {loading && <LoaderIcon className="h-4 w-4 animate-spin" />}
                {loading ? 'Updating…' : 'Update password'}
              </button>
            </form>
          </>
        )}
      </div>

      {showForgotPassword && (
        <ForgotPasswordModal onClose={() => setShowForgotPassword(false)} />
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  // useSearchParams needs a Suspense boundary in the app router
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
