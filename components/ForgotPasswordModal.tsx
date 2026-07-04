'use client';

import { useState } from 'react';
import { authClient } from '@/lib/auth/client';
import { MailIcon, LoaderIcon, CheckCircleIcon } from './Icons';

export default function ForgotPasswordModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      // Neon Auth looks up the email, generates + stores the reset
      // token, and sends the email itself (from auth@mail.myneon.app
      // on the free "shared" email provider). No custom route needed.
      const { error: resetError } = await authClient.requestPasswordReset({
        email,
        redirectTo: `${window.location.origin}/auth/reset`,
      });
      // Always show success, even on unknown email, to avoid leaking
      // which addresses are registered.
      if (!resetError || resetError.status === 404) setSent(true);
      else setError('Something went wrong. Please try again.');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {!sent ? (
          <>
            <h2 className="text-lg font-semibold text-neutral-900">Reset your password</h2>
            <p className="mt-1 text-sm text-neutral-500">
              Enter the email on your account and we&apos;ll send a reset link.
            </p>
            <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
              <div className="relative">
                <MailIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  type="email"
                  required
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 bg-white py-3 pl-10 pr-3 text-[15px] outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10"
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="mt-1 flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-lg border border-neutral-300 py-2.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-neutral-900 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:opacity-60"
                >
                  {loading && <LoaderIcon className="h-4 w-4" />}
                  Send link
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="flex flex-col items-center py-2 text-center">
            <CheckCircleIcon className="h-10 w-10 text-emerald-500" />
            <h2 className="mt-3 text-lg font-semibold text-neutral-900">Check your email</h2>
            <p className="mt-1 text-sm text-neutral-500">
              If an account exists for {email}, a reset link is on its way.
            </p>
            <button
              onClick={onClose}
              className="mt-4 w-full rounded-lg bg-neutral-900 py-2.5 text-sm font-medium text-white hover:bg-neutral-800"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
