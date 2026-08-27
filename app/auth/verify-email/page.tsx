/* ───────────────────────────────────────────────
   Email verification — the step between creating
   an account and being allowed into the app.

   The Neon project requires a verified email
   before it will issue a session, so `signUp.email`
   creates the account and mails a code but signs
   nobody in. Every sign-up route lands here.
   ─────────────────────────────────────────────── */

'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { authClient } from '@/lib/auth/client';
import { getAuthErrorMessage } from '@/lib/auth/errors';
import { LoaderIcon, CheckCircleIcon, AlertCircleIcon } from '@/components/Icons';
import { Button } from '@/components/ui/Button';

const inputClass =
  'w-full rounded-lg border border-dojo-border bg-dojo-surface px-4 py-3 text-sm text-dojo-text-primary outline-none transition placeholder:text-dojo-text-muted/50 focus:border-dojo-accent focus:ring-2 focus:ring-dojo-accent/20';

/**
 * Where to send someone once they are verified.
 *
 * Only same-origin paths: `next` arrives in the query string, so anything
 * else is an open redirect wearing a sign-up flow as a disguise. `//host`
 * is protocol-relative and leaves the site, which is why a bare `/` prefix
 * is not enough on its own.
 */
function safeNext(next: string | null): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return null;
  return next;
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailContent />
    </Suspense>
  );
}

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const email = searchParams.get('email') ?? '';
  const next = safeNext(searchParams.get('next'));
  // `sent=1` means the caller's sign-up already triggered the mail. Sending
  // another would invalidate the code sitting in their inbox and make the
  // first one they try fail.
  const alreadySent = searchParams.get('sent') === '1';

  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(alreadySent);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState('');

  // StrictMode mounts effects twice in development; a second send would spend
  // the first code before anyone could read it.
  const autoSent = useRef(false);

  useEffect(() => {
    if (!email || alreadySent || autoSent.current) return;
    autoSent.current = true;
    // Runs once for the address in the URL — resending is a deliberate click.
    void sendVerificationCode(email);
  }, [email, alreadySent]);

  async function sendVerificationCode(to: string) {
    setSending(true);
    setError('');
    try {
      const { error: sendError } = await authClient.emailOtp.sendVerificationOtp({
        email: to,
        type: 'email-verification',
      });
      if (sendError) {
        setError(getAuthErrorMessage(sendError, 'Could not send the code. Please try again.', 'verify'));
        return;
      }
      setSent(true);
    } catch (err) {
      setError(getAuthErrorMessage(err, 'Network error. Please try again.', 'verify'));
    } finally {
      setSending(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!code || !email) return;

    setVerifying(true);
    setError('');
    try {
      const { error: verifyError } = await authClient.emailOtp.verifyEmail({ email, otp: code });
      if (verifyError) {
        setError(getAuthErrorMessage(verifyError, 'That code did not work. Please try again.', 'verify'));
        return;
      }

      setVerified(true);

      // Verifying signs the account in only where the project enables
      // auto-sign-in. Pushing into the app without checking is how the
      // sign-up path broke in the first place — an unauthenticated landing
      // just bounces back to /auth with nothing explaining why.
      const { data } = await authClient.getSession();
      const destination = data?.user
        ? next ?? '/home'
        : `/auth?verified=1${next ? `&next=${encodeURIComponent(next)}` : ''}`;

      setTimeout(() => {
        router.push(destination);
        router.refresh();
      }, 1200);
    } catch (err) {
      setError(getAuthErrorMessage(err, 'Network error. Please try again.', 'verify'));
    } finally {
      setVerifying(false);
    }
  }

  if (verified) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-dojo-canvas px-4">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-dojo-success/15 ring-1 ring-dojo-success/30">
            <CheckCircleIcon className="h-7 w-7 text-dojo-success-strong" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-dojo-text-primary">Email verified</h1>
          <p className="mt-2 text-sm leading-relaxed text-dojo-text-muted">Taking you through…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-dojo-canvas px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link
            href="/"
            className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-dojo-surface-raised text-2xl"
          >
            🥋
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-dojo-text-primary">Verify your email</h1>
          <p className="mt-2 text-sm leading-relaxed text-dojo-text-muted">
            {email
              ? <>Enter the 6-digit code sent to <span className="font-medium text-dojo-text-primary">{email}</span></>
              : 'We need the address you signed up with to send a code.'}
          </p>
        </div>

        <div className="rounded-2xl border border-dojo-border bg-dojo-surface p-6 sm:p-8">
          {!email ? (
            <p className="text-center text-sm leading-relaxed text-dojo-text-muted">
              Head back to sign in and start again — the code is tied to the address on the account.
            </p>
          ) : !sent && sending ? (
            <div className="flex flex-col items-center py-4 text-center">
              <LoaderIcon className="h-8 w-8 animate-spin text-dojo-text-muted" />
              <p className="mt-3 text-sm text-dojo-text-muted">Sending verification code…</p>
            </div>
          ) : (
            <form onSubmit={handleVerify} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-dojo-text-muted">Verification code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                  className={`${inputClass} text-center text-2xl tracking-[0.5em]`}
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-lg border border-dojo-danger/30 bg-dojo-danger/10 px-3 py-2.5 text-sm text-dojo-danger">
                  <AlertCircleIcon className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              <Button type="submit" size="lg" loading={verifying} disabled={code.length < 6}>
                Verify
              </Button>

              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-dojo-text-muted">The code expires in 10 minutes.</p>
                <button
                  type="button"
                  onClick={() => sendVerificationCode(email)}
                  disabled={sending}
                  className="shrink-0 text-xs font-semibold text-dojo-accent hover:underline disabled:opacity-50"
                >
                  {sending ? 'Sending…' : 'Resend code'}
                </button>
              </div>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-dojo-text-muted">
          <Link href="/auth" className="font-semibold text-dojo-accent hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
