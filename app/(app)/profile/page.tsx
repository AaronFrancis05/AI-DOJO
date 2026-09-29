/* ───────────────────────────────────────────────
   Profile — display name, email, and password, inside the app shell.
   Name and email writes go through Neon Auth. The next layout render
   copies them into users via syncUser. An email change is not applied
   until the confirmation message is completed.
   ─────────────────────────────────────────────── */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowLeft, Check } from 'lucide-react';
import { authClient } from '@/lib/auth/client';
import { getAuthErrorMessage } from '@/lib/auth/errors';
import { useUser } from '@/lib/auth/user-context';
import { usePageTitle } from '@/lib/hooks/PageTitleContext';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import PasswordInput from '@/components/PasswordInput';

const NAME_MAX = 100;
const EMAIL_MAX = 150;

const fieldClass =
  'w-full rounded-lg border border-dojo-border bg-dojo-surface px-4 py-3 text-sm text-dojo-text-primary outline-none transition placeholder:text-dojo-text-muted/50 focus:border-dojo-accent focus:ring-2 focus:ring-dojo-accent/20';

function looksLikeEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function ProfilePage() {
  usePageTitle('Profile');
  const router = useRouter();
  const user = useUser();

  const [name, setName] = useState(user?.name ?? '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState('');

  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [emailVerified, setEmailVerified] = useState<boolean | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [changingEmail, setChangingEmail] = useState(false);
  const [emailMessage, setEmailMessage] = useState('');
  const [emailError, setEmailError] = useState('');
  const [code, setCode] = useState('');
  const [sendingCode, setSendingCode] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const currentEmail = (sessionEmail ?? user?.email ?? '').trim();

  async function loadSessionEmail() {
    const { data } = await authClient.getSession();
    const sessionUser = data?.user as { email?: string | null; emailVerified?: boolean } | undefined;
    setSessionEmail(sessionUser?.email?.trim() || null);
    setEmailVerified(typeof sessionUser?.emailVerified === 'boolean' ? sessionUser.emailVerified : null);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await authClient.getSession();
      if (cancelled) return;
      const sessionUser = data?.user as { email?: string | null; emailVerified?: boolean } | undefined;
      setSessionEmail(sessionUser?.email?.trim() || null);
      setEmailVerified(typeof sessionUser?.emailVerified === 'boolean' ? sessionUser.emailVerified : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.email]);

  async function handleUpdateProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileMessage('');
    setProfileError('');
    const trimmed = name.trim();
    if (!trimmed) {
      setProfileError('Enter a display name.');
      return;
    }
    if (trimmed.length > NAME_MAX) {
      setProfileError(`Display name must be ${NAME_MAX} characters or fewer.`);
      return;
    }
    setSavingProfile(true);
    try {
      const { error } = await authClient.updateUser({ name: trimmed });
      if (error) {
        setProfileError(getAuthErrorMessage(error, 'Update failed', 'profile'));
        return;
      }
      setName(trimmed);
      setProfileMessage('Profile updated.');
      // Layout re-runs syncUser so the sidebar picks up the new name.
      router.refresh();
    } catch (err) {
      setProfileError(getAuthErrorMessage(err, 'Network error. Please try again.', 'profile'));
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleSendCode() {
    if (!currentEmail || sendingCode) return;
    setEmailMessage('');
    setEmailError('');
    setSendingCode(true);
    try {
      const { error } = await authClient.emailOtp.sendVerificationOtp({
        email: currentEmail,
        type: 'email-verification',
      });
      if (error) {
        setEmailError(getAuthErrorMessage(error, 'Could not send the code. Please try again.', 'verify'));
        return;
      }
      setEmailMessage(`A code was sent to ${currentEmail}.`);
    } catch (err) {
      setEmailError(getAuthErrorMessage(err, 'Network error. Please try again.', 'verify'));
    } finally {
      setSendingCode(false);
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (!currentEmail || code.length < 6 || verifyingCode) return;
    setEmailMessage('');
    setEmailError('');
    setVerifyingCode(true);
    try {
      const { error } = await authClient.emailOtp.verifyEmail({ email: currentEmail, otp: code });
      if (error) {
        setEmailError(getAuthErrorMessage(error, 'That code did not work. Please try again.', 'verify'));
        return;
      }
      setCode('');
      setEmailMessage('Email verified.');
      await loadSessionEmail();
      router.refresh();
    } catch (err) {
      setEmailError(getAuthErrorMessage(err, 'Network error. Please try again.', 'verify'));
    } finally {
      setVerifyingCode(false);
    }
  }

  async function handleChangeEmail(e: React.FormEvent) {
    e.preventDefault();
    setEmailMessage('');
    setEmailError('');
    const trimmed = newEmail.trim();
    if (!looksLikeEmail(trimmed) || trimmed.length > EMAIL_MAX) {
      setEmailError('Enter a valid email address.');
      return;
    }
    if (trimmed.toLowerCase() === currentEmail.toLowerCase()) {
      setEmailError('That is already your email address.');
      return;
    }
    setChangingEmail(true);
    try {
      const { error } = await authClient.changeEmail({
        newEmail: trimmed,
        callbackURL: '/profile',
      });
      if (error) {
        setEmailError(getAuthErrorMessage(error, 'Could not start the email change.', 'profile'));
        return;
      }
      setNewEmail('');
      setEmailMessage(
        `Confirmation sent. Your sign-in address stays ${currentEmail || 'the current one'} until you finish that confirmation.`,
      );
    } catch (err) {
      setEmailError(getAuthErrorMessage(err, 'Network error. Please try again.', 'profile'));
    } finally {
      setChangingEmail(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordMessage('');
    setPasswordError('');
    setChangingPassword(true);
    try {
      const { error } = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });
      if (error) {
        setPasswordError(getAuthErrorMessage(error, 'Could not change password', 'profile'));
        return;
      }
      setCurrentPassword('');
      setNewPassword('');
      setPasswordMessage('Password changed. Other devices have been signed out.');
    } catch (err) {
      setPasswordError(getAuthErrorMessage(err, 'Network error. Please try again.', 'profile'));
    } finally {
      setChangingPassword(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-8">
        <button
          type="button"
          onClick={() => {
            if (window.history.length > 1) router.back();
            else router.push('/home');
          }}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-dojo-text-muted transition-colors hover:text-dojo-text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <h1 className="hidden md:block text-2xl font-bold text-dojo-text-primary">Profile</h1>
        <p className="mt-1 text-sm text-dojo-text-muted">
          The name and email on your account.
        </p>
      </div>

      <div className="space-y-4">
        <Card>
          <form onSubmit={handleUpdateProfile}>
            <label htmlFor="display-name" className="mb-2 block text-sm font-semibold text-dojo-text-primary">
              Display name
            </label>
            <input
              id="display-name"
              type="text"
              value={name}
              maxLength={NAME_MAX}
              autoComplete="name"
              onChange={(e) => setName(e.target.value)}
              className={fieldClass}
            />

            {profileMessage && (
              <p className="mt-3 flex items-center gap-2 text-sm text-dojo-success">
                <Check className="h-4 w-4 shrink-0" />
                {profileMessage}
              </p>
            )}
            {profileError && (
              <p className="mt-3 flex items-center gap-2 text-sm text-dojo-danger">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {profileError}
              </p>
            )}

            <Button type="submit" className="mt-4" loading={savingProfile}>
              Save changes
            </Button>
          </form>
        </Card>

        <Card>
          <h2 className="text-sm font-semibold text-dojo-text-primary">Email</h2>
          <p className="mt-3 text-sm text-dojo-text-primary break-all">{currentEmail || '—'}</p>
          {emailVerified !== null && (
            <div className="mt-2">
              <Badge variant={emailVerified ? 'success' : 'warning'}>
                {emailVerified ? 'Verified' : 'Not verified'}
              </Badge>
            </div>
          )}

          {emailVerified === false && (
            <form onSubmit={handleVerifyCode} className="mt-4 flex flex-col gap-3">
              <p className="text-sm text-dojo-text-muted leading-relaxed">
                Confirm this address with the code we email to it.
              </p>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className={fieldClass}
              />
              <div className="flex flex-wrap gap-3">
                <Button type="submit" loading={verifyingCode} disabled={code.length < 6}>
                  Verify email
                </Button>
                <Button type="button" variant="secondary" loading={sendingCode} onClick={handleSendCode}>
                  Send code
                </Button>
              </div>
            </form>
          )}

          <form onSubmit={handleChangeEmail} className="mt-6">
            <label htmlFor="new-email" className="mb-2 block text-sm font-medium text-dojo-text-primary">
              New email
            </label>
            <input
              id="new-email"
              type="email"
              value={newEmail}
              maxLength={EMAIL_MAX}
              autoComplete="email"
              placeholder="name@example.com"
              onChange={(e) => setNewEmail(e.target.value)}
              className={fieldClass}
            />
            <p className="mt-2 text-xs text-dojo-text-muted leading-relaxed">
              A confirmation is sent before this address replaces the one above.
            </p>
            <Button type="submit" className="mt-4" loading={changingEmail} disabled={!newEmail.trim()}>
              Change email
            </Button>
          </form>

          {emailMessage && (
            <p className="mt-3 flex items-center gap-2 text-sm text-dojo-success">
              <Check className="h-4 w-4 shrink-0" />
              {emailMessage}
            </p>
          )}
          {emailError && (
            <p className="mt-3 flex items-center gap-2 text-sm text-dojo-danger">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {emailError}
            </p>
          )}
        </Card>

        <Card>
          <form onSubmit={handleChangePassword}>
            <h2 className="mb-4 text-sm font-semibold text-dojo-text-primary">Password</h2>
            <div className="flex flex-col gap-3">
              <PasswordInput
                value={currentPassword}
                onChange={setCurrentPassword}
                placeholder="Current password"
                autoComplete="current-password"
              />
              <PasswordInput
                value={newPassword}
                onChange={setNewPassword}
                placeholder="New password"
                autoComplete="new-password"
                minLength={6}
                showStrength
              />
            </div>

            {passwordMessage && (
              <p className="mt-3 flex items-center gap-2 text-sm text-dojo-success">
                <Check className="h-4 w-4 shrink-0" />
                {passwordMessage}
              </p>
            )}
            {passwordError && (
              <p className="mt-3 flex items-center gap-2 text-sm text-dojo-danger">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {passwordError}
              </p>
            )}

            <Button type="submit" className="mt-4" loading={changingPassword}>
              Update password
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
