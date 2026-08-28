/* ───────────────────────────────────────────────
   The credential screen, shared by every role's
   door.

   There is one account system and one set of
   credentials; `users.role` decides what they
   open. What differs per role is the copy, the
   showcase panel, and where a *successful* sign-in
   lands — and none of that is worth three
   near-identical 450-line pages that drift apart.
   ─────────────────────────────────────────────── */

'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Mic2, Star, BarChart3, Zap, GraduationCap, ShieldCheck, Users, ClipboardList, CalendarClock, Wallet } from 'lucide-react';
import { authClient } from '@/lib/auth/client';
import { getAuthErrorMessage } from '@/lib/auth/errors';
import PasswordInput from '@/components/PasswordInput';
import ForgotPasswordModal from '@/components/ForgotPasswordModal';
import { AuthRoleTabs } from '@/components/auth/AuthRoleTabs';
import {
  claimAdmin,
  fetchUserRole,
  roleHome,
  roleSignInPath,
  roleSignUpPath,
  safeNext,
} from '@/lib/auth/destinations';
import type { UserRole } from '@/lib/auth/roles';
import {
  MailIcon,
  LoaderIcon,
  AlertCircleIcon,
  CheckCircleIcon,
  GoogleLogo,
} from '@/components/Icons';

export type AuthMode = 'signin' | 'signup';

const inputClass =
  'w-full rounded-lg border border-dojo-border bg-dojo-surface px-4 py-3 text-sm text-dojo-text-primary outline-none transition placeholder:text-dojo-text-muted/50 focus:border-dojo-accent focus:ring-2 focus:ring-dojo-accent/20';

/** Per-role copy and showcase. The form itself is identical for all three. */
const COPY: Record<UserRole, {
  signinTitle: string;
  signinSubtitle: string;
  signupTitle: string;
  signupSubtitle: string;
  showcaseTitle: string;
  showcaseBody: string;
  showcasePoints: { icon: React.ReactNode; text: string }[];
}> = {
  learner: {
    signinTitle: 'Welcome Back! 👋',
    signinSubtitle: 'Continue your language journey.',
    signupTitle: 'Create Your Account',
    signupSubtitle: 'Start your AI-powered language journey.',
    showcaseTitle: 'Your Adventure Awaits',
    showcaseBody: 'Practice speaking with AI characters in immersive real-world scenarios.',
    showcasePoints: [
      { icon: <Mic2 className="h-4 w-4 text-dojo-accent" />, text: 'Real-time voice conversations' },
      { icon: <Star className="h-4 w-4 text-dojo-accent" />, text: 'Personalized feedback' },
      { icon: <BarChart3 className="h-4 w-4 text-dojo-accent" />, text: 'Track your progress' },
      { icon: <Zap className="h-4 w-4 text-dojo-accent" />, text: 'Learn at your own pace' },
    ],
  },
  tutor: {
    signinTitle: 'Welcome back, sensei 👋',
    signinSubtitle: 'Sign in to your teaching console.',
    signupTitle: 'Teach on AI DOJO',
    signupSubtitle: 'Apply to run live lessons alongside the AI.',
    showcaseTitle: 'Your Teaching Console',
    showcaseBody: 'Run live lessons and assessments alongside the AI, with the learner’s whole practice history in front of you.',
    showcasePoints: [
      { icon: <CalendarClock className="h-4 w-4 text-dojo-accent" />, text: 'Publish your availability' },
      { icon: <Users className="h-4 w-4 text-dojo-accent" />, text: 'Live classes and 1-to-1 lessons' },
      { icon: <ClipboardList className="h-4 w-4 text-dojo-accent" />, text: 'Assessments and grading' },
      { icon: <Wallet className="h-4 w-4 text-dojo-accent" />, text: 'Set your own hourly rate' },
    ],
  },
  admin: {
    signinTitle: 'Admin sign in',
    signinSubtitle: 'Restricted to authorised operators.',
    signupTitle: 'Create an admin account',
    signupSubtitle: 'Only pre-authorised addresses can complete this.',
    showcaseTitle: 'Operations Console',
    showcaseBody: 'The catalogue, the curriculum, tutor verification and account administration.',
    showcasePoints: [
      { icon: <ShieldCheck className="h-4 w-4 text-dojo-accent" />, text: 'Tutor verification' },
      { icon: <Users className="h-4 w-4 text-dojo-accent" />, text: 'Account administration' },
      { icon: <ClipboardList className="h-4 w-4 text-dojo-accent" />, text: 'Catalogue and curriculum' },
      { icon: <BarChart3 className="h-4 w-4 text-dojo-accent" />, text: 'Platform statistics' },
    ],
  },
};

export interface AuthScreenProps {
  role: UserRole;
  mode: AuthMode;
}

/**
 * `role` is the door, not a claim. Nothing here grants anything: the account
 * created by an admin sign-up is a plain learner until
 * `POST /api/auth/admin/claim` checks its address against `ADMIN_EMAILS`
 * server-side, and a sign-in routes off the role the *server* reports rather
 * than off which page was open.
 */
export function AuthScreen({ role, mode }: AuthScreenProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const copy = COPY[role];
  const isLogin = mode === 'signin';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  // A failed OAuth round trip comes back as `?error=<code>` (see the redirects
  // in app/api/auth/[...path]/route.ts). Without this the page just looks like
  // it reloaded, which makes the failure impossible to report or diagnose —
  // the query string was the only trace it left.
  const errorCode = searchParams.get('error');
  const redirectError = errorCode
    ? getAuthErrorMessage(
        { code: errorCode },
        'Sign-in did not complete. Please try again.',
        'sign-in',
      )
    : '';
  const displayedError = error || redirectError;

  const next = safeNext(searchParams.get('next'));

  // Someone arriving from /auth/verify-email on a project without auto-sign-in:
  // the account is verified but they still have to sign in, and without saying
  // so the trip back here looks like the verification failed.
  const justVerified = searchParams.has('verified');
  const signedOut = searchParams.has('signed_out');

  const signInHref = withQuery(roleSignInPath(role), next);
  const signUpHref = withQuery(roleSignUpPath(role), next);

  // Already signed in? Send them where their *role* belongs, not where this
  // page's role says. This is the flip-flop the split doors were meant to fix:
  // a tutor who lands on the learner form is still a tutor.
  //
  // The claim runs here too, and has to: this effect fires before anyone can
  // submit the form, so an admin who returns to their door with a live
  // session was being redirected away from the only code that would have
  // promoted them — as a learner, into the learner wizard.
  useEffect(() => {
    if (signedOut) return;
    let cancelled = false;
    authClient.getSession().then(async ({ data }) => {
      if (cancelled || !data?.user) return;
      if (role === 'admin') await claimAdmin();
      if (cancelled) return;
      const actualRole = await fetchUserRole();
      if (!cancelled) router.push(next ?? roleHome(actualRole));
    });
    return () => {
      cancelled = true;
    };
  }, [router, signedOut, next, role]);

  /** Drops `?error=` so the previous attempt's message doesn't outlive it. */
  function clearRedirectError() {
    if (errorCode) router.replace(isLogin ? signInHref : signUpHref, { scroll: false });
  }

  /** Where this account belongs, asked of the server rather than assumed. */
  async function landAfterSignIn() {
    const actualRole = await fetchUserRole();
    router.push(next ?? roleHome(actualRole));
    router.refresh();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    clearRedirectError();

    // The HTML `required` on the name field allows whitespace-only input —
    // an account must never be created without a usable display name.
    if (!isLogin && !name.trim()) {
      setError('Please enter your full name.');
      return;
    }
    // The confirm field used to mirror the first one and validate nothing, so
    // a typo in the password was carried silently into the new account.
    if (!isLogin && password !== confirmPassword) {
      setError('The two passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      const { error: authError } = isLogin
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ email, password, name });

      if (authError) {
        setError(
          getAuthErrorMessage(
            authError,
            'Something went wrong. Please try again.',
            isLogin ? 'sign-in' : 'sign-up',
          ),
        );
        return;
      }

      void consent;

      if (isLogin) {
        if (role === 'admin') {
          const problem = await claimAdmin();
          // Not fatal: they are signed in, and an existing admin whose address
          // was since removed from the list still has a role to land on.
          if (problem) setNotice(problem);
        }
        await landAfterSignIn();
        return;
      }

      // A sign-up leaves no session on this project — it requires a verified
      // email first, so `signUp.email` returns `token: null` and sets no
      // cookie. Pushing straight into the app just bounces off the (app) gate
      // with nothing on screen explaining why, which is how accounts ended up
      // created-but-stranded. Check rather than assume.
      //
      // Every new learner goes through onboarding; an admin does not, and the
      // claim route stamps `onboardingCompletedAt` for them.
      const destination = role === 'admin' ? '/admin' : '/onboarding';

      const { data } = await authClient.getSession();
      if (!data?.user) {
        // Neon mailed a code as part of the sign-up (`sent=1`) — a second one
        // would invalidate the code already in their inbox. `next` carries the
        // role's landing through verification, and the admin claim happens on
        // the sign-in that follows it.
        const params = new URLSearchParams({ email, sent: '1', next: destination });
        router.push(`/auth/verify-email?${params}`);
        return;
      }

      if (role === 'admin') {
        const problem = await claimAdmin();
        if (problem) {
          setError(`${problem} Your account was created as a learner.`);
          router.push('/home');
          return;
        }
      }

      router.push(destination);
      router.refresh();
    } catch (err) {
      setError(
        getAuthErrorMessage(
          err,
          'Network error. Please try again.',
          isLogin ? 'sign-in' : 'sign-up',
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  function handleGoogleAuth() {
    // Full page navigation, so the stale `?error=` leaves with it.
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
          <div className="text-sm text-dojo-text-muted">
            {isLogin ? (
              <>
                Don&apos;t have an account?{' '}
                <Link href={signUpHref} className="font-semibold text-dojo-accent hover:underline">
                  Register
                </Link>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <Link href={signInHref} className="font-semibold text-dojo-accent hover:underline">
                  Log in
                </Link>
              </>
            )}
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-8 py-10">
          {/* Admin has no tab: the console is not something to advertise a door
              to. It is reachable only by typing /auth/admin/signin. */}
          {role !== 'admin' && <AuthRoleTabs role={role} mode={mode} next={next} />}

          <div className="mb-8">
            <h1 className="text-2xl font-bold text-dojo-text-primary">
              {isLogin ? copy.signinTitle : copy.signupTitle}
            </h1>
            <p className="mt-1 text-sm leading-relaxed text-dojo-text-muted">
              {isLogin ? copy.signinSubtitle : copy.signupSubtitle}
            </p>
          </div>

          {justVerified && isLogin && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-dojo-success/30 bg-dojo-success/10 px-3 py-2.5 text-sm text-dojo-success-strong">
              <CheckCircleIcon className="h-4 w-4 shrink-0" />
              Your email is verified — sign in to continue.
            </div>
          )}

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
                  className={inputClass}
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
                className={inputClass}
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
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  placeholder="Confirm password"
                  autoComplete="new-password"
                  minLength={6}
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

            {displayedError && (
              <div className="flex items-center gap-2 rounded-lg border border-dojo-danger/30 bg-dojo-danger/10 px-3 py-2.5 text-sm text-dojo-danger">
                <AlertCircleIcon className="h-4 w-4 shrink-0" />
                {displayedError}
              </div>
            )}

            {notice && !displayedError && (
              <div className="flex items-center gap-2 rounded-lg border border-dojo-border bg-dojo-surface px-3 py-2.5 text-sm text-dojo-text-muted">
                <MailIcon className="h-4 w-4 shrink-0" />
                {notice}
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

          {/* Google is a learner/tutor convenience. The OAuth callback cannot
              carry an allowlist decision, so admin promotion stays on the
              password path where the claim route can answer for it. */}
          {role !== 'admin' && (
            <>
              <div className="my-5 flex items-center gap-3">
                <div className="h-px flex-1 bg-dojo-border" />
                <span className="text-xs text-dojo-text-muted">or continue with</span>
                <div className="h-px flex-1 bg-dojo-border" />
              </div>

              <button
                type="button"
                onClick={handleGoogleAuth}
                className="flex w-full items-center justify-center gap-3 rounded-lg border border-dojo-border bg-dojo-surface py-3 text-sm font-medium text-dojo-text-primary transition-colors hover:bg-dojo-surface-raised"
              >
                <GoogleLogo />
                Continue with Google
              </button>
            </>
          )}

          {role === 'learner' && (
            <p className="mt-6 text-center text-xs text-dojo-text-muted">
              Want to teach?{' '}
              <Link href="/auth/tutor/signup" className="font-semibold text-dojo-accent hover:underline">
                Apply as a tutor
              </Link>
            </p>
          )}

          {role === 'tutor' && isLogin && (
            <p className="mt-6 text-center text-xs text-dojo-text-muted">
              Not a tutor yet?{' '}
              <Link href="/auth/tutor/signup" className="font-semibold text-dojo-accent hover:underline">
                Apply to teach
              </Link>
            </p>
          )}

          <p className="mt-3 text-center text-xs text-dojo-text-muted">
            By continuing, you agree to our{' '}
            <span className="cursor-pointer text-dojo-accent underline">Terms of Service</span> and{' '}
            <span className="cursor-pointer text-dojo-accent underline">Privacy Policy</span>.
          </p>
        </div>
      </div>

      {/* RIGHT COLUMN — DECORATIVE PANEL */}
      <div className="relative hidden flex-1 overflow-hidden lg:flex flex-col">
        {role === 'learner' && isLogin ? (
          <>
            <Image
              src="/avatar.png"
              fill
              className="object-cover object-top"
              alt=""
              priority
              sizes="(max-width: 1024px) 100vw, 480px"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/30 to-transparent" />

            <div className="absolute inset-0 z-10 flex flex-col justify-between p-10">
              <div className="ml-auto max-w-xs rounded-2xl rounded-tr-none border border-white/10 bg-black/50 p-4 shadow-xl backdrop-blur-xl">
                <div className="text-sm font-medium leading-relaxed text-white">おかえり！</div>
                <div className="mt-1 text-xs text-white/70">Welcome back!</div>
                <div className="my-2 h-px bg-white/10" />
                <div className="text-sm font-medium text-white">今日も一緒に頑張りましょう！</div>
                <div className="mt-1 text-xs text-white/70">Let&apos;s do our best today!</div>
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
            <div className="absolute inset-0 bg-gradient-to-br from-black/80 via-black/30 to-black/50" />

            <div className="absolute inset-0 z-10 flex flex-col justify-center p-12">
              <div className="mb-8">
                {role !== 'learner' && (
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white">
                    {role === 'tutor' ? <GraduationCap className="h-6 w-6" /> : <ShieldCheck className="h-6 w-6" />}
                  </div>
                )}
                <h2 className="text-3xl font-bold leading-tight text-white">{copy.showcaseTitle}</h2>
                <p className="mt-3 text-base leading-relaxed text-white/80">{copy.showcaseBody}</p>
              </div>

              <div className="mb-12 space-y-4">
                {copy.showcasePoints.map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-dojo-accent/30 bg-dojo-accent/20 text-dojo-accent">
                      {item.icon}
                    </div>
                    <span className="text-sm font-medium text-white">{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {showForgotPassword && (
        <ForgotPasswordModal
          initialEmail={email}
          onClose={() => setShowForgotPassword(false)}
        />
      )}
    </div>
  );
}

/** Keeps a `?next=` on the link that switches between sign-in and sign-up. */
function withQuery(path: string, next: string | null): string {
  return next ? `${path}?next=${encodeURIComponent(next)}` : path;
}
