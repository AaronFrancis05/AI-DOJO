'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth/client';
import PasswordInput from '@/components/PasswordInput';
import { UserIcon, LoaderIcon, AlertCircleIcon, CheckCircleIcon, LogOutIcon } from '@/components/Icons';
import NavBar from '@/components/NavBar';

type SessionUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  const [name, setName] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await authClient.getSession();
      if (!data?.user) {
        router.push('/auth?redirect=/profile');
        return;
      }
      setUser(data.user as SessionUser);
      setName(data.user.name ?? '');
      setLoadingUser(false);
    })();
  }, [router]);

  async function refreshUser() {
    const { data } = await authClient.getSession();
    if (data?.user) setUser(data.user as SessionUser);
  }

  async function handleUpdateProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileMessage('');
    setProfileError('');
    setSavingProfile(true);
    try {
      const { error } = await authClient.updateUser({ name });
      if (error) {
        setProfileError(error.message || 'Update failed');
        return;
      }
      await refreshUser();
      setProfileMessage('Profile updated.');
    } catch {
      setProfileError('Network error. Please try again.');
    } finally {
      setSavingProfile(false);
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
        setPasswordError(error.message || 'Could not change password');
        return;
      }
      setCurrentPassword('');
      setNewPassword('');
      setPasswordMessage('Password changed. Other devices have been signed out.');
    } catch {
      setPasswordError('Network error. Please try again.');
    } finally {
      setChangingPassword(false);
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    await authClient.signOut();
    router.push('/auth');
    router.refresh();
  }

  if (loadingUser) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-neutral-50">
        <LoaderIcon className="h-6 w-6 text-neutral-400" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-neutral-50">
      <NavBar />
      <div className="mx-auto max-w-xl px-4 py-12">
        <div className="mb-8 flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-neutral-900 text-white">
            <UserIcon className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-neutral-900">{user?.name || 'Your profile'}</h1>
            <p className="text-sm text-neutral-500">{user?.email}</p>
          </div>
        </div>

        <form
          onSubmit={handleUpdateProfile}
          className="mb-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm"
        >
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Profile
          </h2>
          <label className="mb-1 block text-sm font-medium text-neutral-700">Display name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 bg-white py-2.5 px-3 text-[15px] outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10"
          />

          {profileMessage && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700">
              <CheckCircleIcon className="h-4 w-4 shrink-0" />
              {profileMessage}
            </div>
          )}
          {profileError && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
              <AlertCircleIcon className="h-4 w-4 shrink-0" />
              {profileError}
            </div>
          )}

          <button
            type="submit"
            disabled={savingProfile}
            className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:opacity-60"
          >
            {savingProfile && <LoaderIcon className="h-4 w-4" />}
            Save changes
          </button>
        </form>

        <form
          onSubmit={handleChangePassword}
          className="mb-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm"
        >
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Change password
          </h2>
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
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700">
              <CheckCircleIcon className="h-4 w-4 shrink-0" />
              {passwordMessage}
            </div>
          )}
          {passwordError && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
              <AlertCircleIcon className="h-4 w-4 shrink-0" />
              {passwordError}
            </div>
          )}

          <button
            type="submit"
            disabled={changingPassword}
            className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:opacity-60"
          >
            {changingPassword && <LoaderIcon className="h-4 w-4" />}
            Update password
          </button>
        </form>

        <div className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-red-500">
            Danger zone
          </h2>
          <p className="mb-4 text-sm text-neutral-600">
            Sign out of your account on this device.
          </p>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex items-center justify-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2.5 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-60"
          >
            {loggingOut ? <LoaderIcon className="h-4 w-4" /> : <LogOutIcon className="h-4 w-4" />}
            {loggingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </div>
    </div>
  );
}
