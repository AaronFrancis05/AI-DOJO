'use client';

import { useEffect, useRef, useState } from 'react';
import { authClient } from '@/lib/auth/client';
import { getAuthErrorMessage } from '@/lib/auth/errors';
import { MailIcon, LoaderIcon, CheckCircleIcon, AlertCircleIcon } from './Icons';

export default function ForgotPasswordModal({
  onClose,
  initialEmail = '',
}: {
  onClose: () => void;
  /** Prefilled when the login form already has an address typed in. */
  initialEmail?: string;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => { emailRef.current?.focus(); }, []);

  // A modal that traps the eye should release on Escape like every other one.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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
      // which addresses are registered. Real failures (rate limit, network,
      // auth server down) still surface — claiming success there would leave
      // the learner waiting for an email that was never sent.
      if (!resetError || resetError.status === 404) setSent(true);
      else setError(getAuthErrorMessage(resetError, 'Something went wrong. Please try again.', 'reset'));
    } catch (err) {
      setError(getAuthErrorMessage(err, 'Network error. Please try again.', 'reset'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Reset your password"
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-dojo-border bg-dojo-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {!sent ? (
          <>
            <h2 className="text-lg font-bold text-dojo-text-primary">Reset your password</h2>
            <p className="mt-1 text-sm text-dojo-text-muted leading-relaxed">
              Enter the email on your account and we&apos;ll send a reset link.
            </p>
            <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
              <div className="relative">
                <MailIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dojo-text-muted/60" />
                <input
                  ref={emailRef}
                  type="email"
                  required
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-dojo-border bg-dojo-surface-raised py-3 pl-10 pr-3 text-sm text-dojo-text-primary outline-none transition placeholder:text-dojo-text-muted/50 focus:border-dojo-accent focus:ring-2 focus:ring-dojo-accent/20"
                />
              </div>
              {error && (
                <div className="flex items-center gap-2 rounded-lg border border-dojo-danger/30 bg-dojo-danger/10 px-3 py-2.5 text-sm text-dojo-danger">
                  <AlertCircleIcon className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}
              <div className="mt-1 flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-lg border border-dojo-border py-3 text-sm font-medium text-dojo-text-muted transition-colors hover:bg-dojo-surface-raised hover:text-dojo-text-primary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !email.trim()}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-dojo-accent py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {loading && <LoaderIcon className="h-4 w-4 animate-spin" />}
                  {loading ? 'Sending…' : 'Send link'}
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="flex flex-col items-center py-2 text-center">
            <CheckCircleIcon className="h-10 w-10 text-dojo-success" />
            <h2 className="mt-3 text-lg font-bold text-dojo-text-primary">Check your email</h2>
            <p className="mt-1 text-sm text-dojo-text-muted leading-relaxed">
              If an account exists for {email}, a reset link is on its way. The link expires in an hour.
            </p>
            <button
              onClick={onClose}
              className="mt-4 w-full rounded-lg bg-dojo-accent py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
