'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authClient } from '@/lib/auth/client';
import PasswordInput from '@/components/PasswordInput';
import { LoaderIcon, AlertCircleIcon, CheckCircleIcon } from '@/components/Icons';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!token) {
      setError('This reset link is invalid or missing a token. Request a new one.');
      return;
    }
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
        setError(resetError.message || 'This link may have expired. Request a new one.');
        return;
      }
      setDone(true);
      setTimeout(() => router.push('/auth'), 2000);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 py-12">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
        {!done ? (
          <>
            <h1 className="text-lg font-semibold text-neutral-900">Set a new password</h1>
            <p className="mt-1 text-sm text-neutral-500">
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
                <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
                  <AlertCircleIcon className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={loading}
                className="mt-1 flex items-center justify-center gap-2 rounded-lg bg-neutral-900 py-3 text-[15px] font-semibold text-white transition hover:bg-neutral-800 disabled:opacity-60"
              >
                {loading && <LoaderIcon className="h-4 w-4" />}
                {loading ? 'Updating…' : 'Update password'}
              </button>
            </form>
          </>
        ) : (
          <div className="flex flex-col items-center py-2 text-center">
            <CheckCircleIcon className="h-10 w-10 text-emerald-500" />
            <h2 className="mt-3 text-lg font-semibold text-neutral-900">Password updated</h2>
            <p className="mt-1 text-sm text-neutral-500">Redirecting you to log in…</p>
          </div>
        )}
      </div>
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
