'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import PasswordInput from '@/components/PasswordInput';
import { LoaderIcon, CheckCircleIcon, AlertCircleIcon } from '@/components/Icons';
import Link from 'next/link';

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Missing reset token. Use the link from your email.');
    }
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Something went wrong');
        return;
      }

      setSuccess(true);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (!token && !error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
        <LoaderIcon className="h-6 w-6 animate-spin text-neutral-400" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
          {success ? (
            <div className="flex flex-col items-center py-4 text-center">
              <CheckCircleIcon className="h-10 w-10 text-emerald-500" />
              <h2 className="mt-3 text-lg font-semibold text-neutral-900">Password reset</h2>
              <p className="mt-1 text-sm text-neutral-500">
                Your password has been updated successfully.
              </p>
              <Link
                href="/auth"
                className="mt-4 w-full rounded-lg bg-neutral-900 py-2.5 text-center text-sm font-medium text-white hover:bg-neutral-800"
              >
                Back to login
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-neutral-900">Set new password</h2>
              <p className="mt-1 text-sm text-neutral-500">
                Choose a new password for your account.
              </p>
              <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
                <PasswordInput
                  value={password}
                  onChange={setPassword}
                  placeholder="New password (min 6 characters)"
                  autoComplete="new-password"
                  minLength={6}
                  showStrength
                />

                {error && (
                  <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
                    <AlertCircleIcon className="h-4 w-4 shrink-0" />
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || !token}
                  className="flex items-center justify-center gap-2 rounded-lg bg-neutral-900 py-3 text-[15px] font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading && <LoaderIcon className="h-4 w-4 animate-spin" />}
                  {loading ? 'Resetting…' : 'Reset password'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
