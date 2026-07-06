'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth/client';
import { MailIcon, LoaderIcon, CheckCircleIcon, AlertCircleIcon } from '@/components/Icons';

export default function VerifyEmailPage(props: {
  searchParams?: Promise<{ token?: string; email?: string }>;
}) {
  const searchParams = use(props?.searchParams ?? Promise.resolve({} as Record<string, string | undefined>));
  const router = useRouter();
  const emailParam = searchParams?.email ?? null;

  const [email, setEmail] = useState(emailParam || '');
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [autoSending, setAutoSending] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!emailParam || sent || autoSending) return;
    setAutoSending(true);
    sendVerificationOtp(emailParam);
  }, []);

  async function sendVerificationOtp(to: string) {
    setSending(true);
    setError('');
    try {
      const { error: sendError } = await authClient.emailOtp.sendVerificationOtp({
        email: to,
        type: 'email-verification',
      });
      if (sendError) {
        setError(sendError.message || 'Failed to send code');
      }
      setSent(true);
    } catch {
      setError('Network error');
    } finally {
      setSending(false);
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (!code || !email) return;
    setVerifying(true);
    setError('');
    try {
      const { error: verifyError } = await authClient.emailOtp.verifyEmail({
        email,
        otp: code,
      });
      if (verifyError) {
        setError(verifyError.message || 'Verification failed');
      } else {
        setVerified(true);
        setTimeout(() => router.push('/dashboard'), 2000);
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setVerifying(false);
    }
  }

  async function handleResend(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    await sendVerificationOtp(email);
  }

  if (verified) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-neutral-50 px-4">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircleIcon className="h-7 w-7 text-emerald-600" />
          </div>
          <h1 className="text-xl font-semibold text-neutral-900">Email verified!</h1>
          <p className="mt-1.5 text-sm text-neutral-500">Redirecting you back…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-neutral-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-900 text-2xl">
            🥋
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Verify your email</h1>
          <p className="mt-1.5 text-sm text-neutral-500">
            {!sent ? 'Sending verification code…' : `Enter the code sent to ${email}`}
          </p>
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
          {!sent ? (
            <div className="flex flex-col items-center py-4 text-center">
              <LoaderIcon className="h-8 w-8 text-neutral-400" />
              <p className="mt-3 text-sm text-neutral-500">Sending verification code…</p>
            </div>
          ) : (
            <form onSubmit={handleVerifyCode} className="flex flex-col gap-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-neutral-700">
                  Verification code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                  autoComplete="one-time-code"
                  className="w-full rounded-lg border border-neutral-300 bg-white py-3 px-3 text-center text-2xl tracking-[0.5em] text-[15px] outline-none transition focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
                  <AlertCircleIcon className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={verifying || code.length < 4}
                className="flex items-center justify-center gap-2 rounded-lg bg-neutral-900 py-3 text-[15px] font-semibold text-white transition hover:bg-neutral-800 disabled:opacity-60"
              >
                {verifying && <LoaderIcon className="h-4 w-4" />}
                {verifying ? 'Verifying…' : 'Verify'}
              </button>

              <button
                type="button"
                onClick={handleResend}
                disabled={sending}
                className="text-sm text-neutral-500 underline underline-offset-2 hover:text-neutral-900 disabled:opacity-50"
              >
                {sending ? 'Sending…' : 'Resend code'}
              </button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-neutral-500">
          <a href="/auth" className="font-medium text-neutral-900 underline underline-offset-2">
            Back to login
          </a>
        </p>
      </div>
    </div>
  );
}
