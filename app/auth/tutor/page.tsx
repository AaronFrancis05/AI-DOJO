/* ───────────────────────────────────────────────
   Tutor signup — separate from the learner landing
   page. Creates the account, then the pending
   `tutors` profile. Verification is a human step,
   done from /admin.
   ─────────────────────────────────────────────── */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, GraduationCap } from 'lucide-react';
import { authClient } from '@/lib/auth/client';
import { getAuthErrorCode, getAuthErrorMessage } from '@/lib/auth/errors';
import { AlertCircleIcon, LoaderIcon } from '@/components/Icons';
import PasswordInput from '@/components/PasswordInput';
import { Button } from '@/components/ui/Button';
import { TARGET_LANGUAGES } from '@/lib/language';

const inputClass =
  'w-full rounded-lg border border-dojo-border bg-dojo-surface px-4 py-3 text-sm text-dojo-text-primary outline-none transition placeholder:text-dojo-text-muted/50 focus:border-dojo-accent focus:ring-2 focus:ring-dojo-accent/20';

/**
 * The browser's timezone, on demand.
 *
 * Read from a click rather than seeded on mount: the server render resolves
 * to the *server's* zone, so pre-filling it would either hydrate to a
 * different value than it rendered with, or quietly file a tutor's
 * availability under a zone they never chose. Availability is stored in this
 * zone (see `app/api/tutors/[id]/availability`), so a wrong one shifts every
 * slot they ever advertise.
 */
function detectTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export default function TutorSignupPage() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [headline, setHeadline] = useState('');
  const [bio, setBio] = useState('');
  const [languages, setLanguages] = useState<string[]>([]);
  const [timezone, setTimezone] = useState('UTC');
  const [hourlyRate, setHourlyRate] = useState('25');

  const [alreadySignedIn, setAlreadySignedIn] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  // The profile is filled in first and posted last; between the two sits the
  // email check the Neon project requires before it will hand out a session.
  const [step, setStep] = useState<'form' | 'verify'>('form');
  const [code, setCode] = useState('');
  const [sendingCode, setSendingCode] = useState(false);
  const [codeResent, setCodeResent] = useState(false);

  // An existing learner can become a tutor without a second account — the
  // profile attaches to whoever is signed in.
  useEffect(() => {
    authClient.getSession()
      .then(({ data }) => setAlreadySignedIn(Boolean(data?.user)))
      .catch(() => setAlreadySignedIn(false))
      .finally(() => setCheckingAuth(false));
  }, []);

  const toggleLanguage = (code: string) => {
    setLanguages((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  };

  /** Mails a fresh verification code to the address on the form. */
  async function sendVerificationCode() {
    setSendingCode(true);
    setError('');
    setCodeResent(false);
    try {
      const { error: sendError } = await authClient.emailOtp.sendVerificationOtp({
        email,
        type: 'email-verification',
      });
      if (sendError) {
        setError(getAuthErrorMessage(sendError, 'Could not send the code. Please try again.', 'verify'));
        return;
      }
      setCodeResent(true);
    } catch (err) {
      setError(getAuthErrorMessage(err, 'Network error. Please try again.', 'verify'));
    } finally {
      setSendingCode(false);
    }
  }

  /**
   * Signs the applicant in, or parks them on the verification step.
   *
   * The Neon project requires a verified email before it will issue a session,
   * so `signUp.email` creates the account and mails a code but signs nobody in.
   * Posting the profile straight after it — which is what this page used to do
   * — hit `/api/tutors/apply` with no cookie, so every first-time applicant got
   * a bare "Unauthorized", lost the form, and was left with an account but no
   * `tutors` row. Never assume a sign-up produced a session.
   */
  async function establishSession(): Promise<boolean> {
    const { error: signUpError } = await authClient.signUp.email({ email, password, name });

    if (signUpError) {
      const code = getAuthErrorCode(signUpError);
      if (code !== 'user_already_exists' && code !== 'email_exists') {
        setError(getAuthErrorMessage(signUpError, 'Something went wrong. Please try again.', 'sign-up'));
        return false;
      }
      // Most likely their own account from an attempt that died at the profile
      // step, so sign in rather than dead-ending on "already exists".
      const { error: signInError } = await authClient.signIn.email({ email, password });
      if (!signInError) return true;

      const signInCode = getAuthErrorCode(signInError);
      if (signInCode === 'email_not_verified' || signInCode === 'email_not_confirmed') {
        setStep('verify');
        await sendVerificationCode();
        return false;
      }
      setError(getAuthErrorMessage(signInError, 'Something went wrong. Please try again.', 'sign-in'));
      return false;
    }

    // A session exists here only on a project that lets unverified accounts in.
    const { data } = await authClient.getSession();
    if (data?.user) return true;

    // Neon mailed a code as part of the sign-up — a second one would invalidate
    // the one already sitting in their inbox.
    setStep('verify');
    return false;
  }

  /** Posts the profile. The session must already exist. */
  async function submitProfile(): Promise<void> {
    const res = await fetch('/api/tutors/apply', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        headline: headline.trim(),
        bio: bio.trim(),
        languages,
        timezone,
        hourlyRateCents: Math.round(Number(hourlyRate) * 100),
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(
        res.status === 401
          ? 'Your sign-in did not carry through. Please sign in and apply again.'
          : data?.error ?? 'Could not create your tutor profile. Please try again.',
      );
      return;
    }

    setSubmitted(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!alreadySignedIn && !name.trim()) {
      setError('Please enter your full name.');
      return;
    }
    if (!headline.trim()) {
      setError('Please add a headline so learners know what you teach.');
      return;
    }
    if (languages.length === 0) {
      setError('Select at least one language you teach.');
      return;
    }

    const rate = Number(hourlyRate);
    if (!Number.isFinite(rate) || rate < 0) {
      setError('Enter a valid hourly rate.');
      return;
    }

    setSubmitting(true);
    try {
      if (!alreadySignedIn && !(await establishSession())) return;
      await submitProfile();
    } catch (err) {
      setError(getAuthErrorMessage(err, 'Network error. Please try again.', 'sign-up'));
    } finally {
      setSubmitting(false);
    }
  }

  /** Verification step: confirm the code, then post the held profile. */
  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setCodeResent(false);

    setSubmitting(true);
    try {
      const { error: verifyError } = await authClient.emailOtp.verifyEmail({ email, otp: code });
      if (verifyError) {
        setError(getAuthErrorMessage(verifyError, 'That code did not work. Please try again.', 'verify'));
        return;
      }

      // Verifying signs the account in only where the project enables
      // auto-sign-in, so confirm instead of trusting it — this is the same
      // assumption that broke the sign-up path.
      const { data } = await authClient.getSession();
      if (!data?.user) {
        const { error: signInError } = await authClient.signIn.email({ email, password });
        if (signInError) {
          setError(
            getAuthErrorMessage(
              signInError,
              'Your email is verified — please sign in to finish your application.',
              'sign-in',
            ),
          );
          return;
        }
      }

      await submitProfile();
    } catch (err) {
      setError(getAuthErrorMessage(err, 'Network error. Please try again.', 'verify'));
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-dojo-canvas px-4">
        <div className="w-full max-w-md rounded-2xl border border-dojo-border bg-dojo-surface-raised p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-dojo-success/15 ring-1 ring-dojo-success/30">
            <CheckCircle2 className="h-7 w-7 text-dojo-success-strong" />
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-dojo-text-primary">
            Application received
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-dojo-text-muted">
            Your profile is pending review. A human verifies every tutor before they appear to
            learners — we&apos;ll let you know as soon as that&apos;s done.
          </p>
          <p className="mt-4 rounded-lg border border-dojo-border bg-dojo-surface px-4 py-3 text-sm leading-relaxed text-dojo-text-muted">
            Your teaching console is under <span className="font-medium text-dojo-text-primary">Teaching</span> in
            the sidebar. Next time, sign in at{' '}
            <Link href="/auth" className="font-medium text-dojo-accent hover:underline">
              /auth
            </Link>{' '}
            with this email and password.
          </p>
          {/* The console, not /home — they just became a tutor, and the role is
              already written by the time this screen renders. */}
          <Button className="mt-6 w-full" size="lg" onClick={() => router.push('/tutor')}>
            Go to your teaching console
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-dojo-canvas">
      <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center justify-between">
          <Link href="/" className="text-lg font-bold text-dojo-text-primary">🥋 AI DOJO</Link>
          {/* Tutors sign in through the same page everyone else does — there is
              one account system and `users.role` decides what it opens. The old
              label here read "Learner sign in", which told a returning tutor
              this was not their door and left them with no door at all. */}
          <span className="text-sm text-dojo-text-muted">
            Already have an account?{' '}
            <Link href="/auth?next=/tutor" className="font-semibold text-dojo-accent hover:underline">
              Sign in
            </Link>
          </span>
        </div>

        <div className="mb-8 flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-dojo-accent/15 text-dojo-accent">
            <GraduationCap className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight leading-none text-dojo-text-primary">
              {step === 'verify' ? 'Confirm your email' : 'Teach on AI DOJO'}
            </h1>
            <p className="mt-2 text-base leading-relaxed text-dojo-text-muted">
              {step === 'verify'
                ? 'We sent a 6-digit code to your inbox. Your profile is filled in and waiting — entering the code files the application.'
                : 'Run live lessons and assessments alongside the AI. Every profile is reviewed by a human before it goes live.'}
            </p>
          </div>
        </div>

        {step === 'verify' ? (
          <form onSubmit={handleVerify} className="flex flex-col gap-6">
            <section className="rounded-2xl border border-dojo-border bg-dojo-surface p-6">
              <h2 className="text-base font-bold text-dojo-text-primary">Verification code</h2>
              <p className="mt-1 text-sm leading-relaxed text-dojo-text-muted">
                Sent to <span className="font-medium text-dojo-text-primary">{email}</span>
              </p>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
                className={`${inputClass} mt-4 text-center text-2xl tracking-[0.5em]`}
              />
              <div className="mt-4 flex items-center justify-between gap-2">
                <p className="text-xs text-dojo-text-muted">
                  {codeResent ? 'A new code is on its way.' : 'The code expires in 10 minutes.'}
                </p>
                <button
                  type="button"
                  onClick={sendVerificationCode}
                  disabled={sendingCode}
                  className="shrink-0 text-xs font-semibold text-dojo-accent hover:underline disabled:opacity-50"
                >
                  {sendingCode ? 'Sending…' : 'Resend code'}
                </button>
              </div>
            </section>

            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-dojo-danger/30 bg-dojo-danger/10 px-3 py-2.5 text-sm text-dojo-danger">
                <AlertCircleIcon className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <Button type="submit" size="lg" loading={submitting} disabled={code.length < 6}>
              Verify and apply
            </Button>

            <button
              type="button"
              onClick={() => {
                setStep('form');
                setError('');
                setCodeResent(false);
              }}
              className="text-sm text-dojo-text-muted hover:text-dojo-text-primary"
            >
              Back to your profile
            </button>
          </form>
        ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          {!checkingAuth && !alreadySignedIn && (
            <section className="rounded-2xl border border-dojo-border bg-dojo-surface p-6">
              <h2 className="text-base font-bold text-dojo-text-primary">Your account</h2>
              <div className="mt-4 flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-dojo-text-muted">Full name</label>
                  <input type="text" placeholder="Alex Kim" value={name} onChange={(e) => setName(e.target.value)} required className={inputClass} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-dojo-text-muted">Email address</label>
                  <input type="email" placeholder="alex@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required className={inputClass} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-dojo-text-muted">Password</label>
                  <PasswordInput value={password} onChange={setPassword} placeholder="Password (min 6 characters)" autoComplete="new-password" minLength={6} showStrength />
                </div>
              </div>
            </section>
          )}

          {alreadySignedIn && (
            <p className="rounded-lg border border-dojo-border bg-dojo-surface px-4 py-3 text-sm text-dojo-text-muted">
              You&apos;re signed in — this will add a tutor profile to your existing account.
            </p>
          )}

          <section className="rounded-2xl border border-dojo-border bg-dojo-surface p-6">
            <h2 className="text-base font-bold text-dojo-text-primary">Your teaching profile</h2>
            <div className="mt-4 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-dojo-text-muted">Headline</label>
                <input
                  type="text"
                  placeholder="Conversational Japanese for absolute beginners"
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  maxLength={160}
                  required
                  className={inputClass}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-dojo-text-muted">About you <span className="text-dojo-text-muted/60">(optional)</span></label>
                <textarea
                  rows={4}
                  placeholder="Where you teach from, how you run a lesson, what learners can expect."
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className={`${inputClass} resize-y leading-relaxed`}
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-dojo-text-muted">Languages you teach</label>
                <div className="flex flex-wrap gap-2">
                  {TARGET_LANGUAGES.map((lang) => {
                    const selected = languages.includes(lang.code);
                    return (
                      <button
                        key={lang.code}
                        type="button"
                        onClick={() => toggleLanguage(lang.code)}
                        aria-pressed={selected}
                        className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                          selected
                            ? 'border-dojo-accent bg-dojo-accent/10 text-dojo-text-primary'
                            : 'border-dojo-border bg-dojo-surface-raised text-dojo-text-muted hover:border-dojo-accent/50'
                        }`}
                      >
                        {lang.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-dojo-text-muted">Timezone</label>
                  <input
                    type="text"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    placeholder="Africa/Kampala"
                    required
                    className={inputClass}
                  />
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-dojo-text-muted">
                      Your availability is stored in this zone.
                    </p>
                    <button
                      type="button"
                      onClick={() => setTimezone(detectTimeZone())}
                      className="shrink-0 text-xs font-semibold text-dojo-accent hover:underline"
                    >
                      Use mine
                    </button>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-dojo-text-muted">Hourly rate (USD)</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={hourlyRate}
                    onChange={(e) => setHourlyRate(e.target.value)}
                    required
                    className={inputClass}
                  />
                </div>
              </div>
            </div>
          </section>

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-dojo-danger/30 bg-dojo-danger/10 px-3 py-2.5 text-sm text-dojo-danger">
              <AlertCircleIcon className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <Button type="submit" size="lg" loading={submitting} disabled={checkingAuth}>
            {checkingAuth && <LoaderIcon className="h-4 w-4 animate-spin" />}
            Apply to teach
          </Button>
        </form>
        )}
      </div>
    </div>
  );
}
