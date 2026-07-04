'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import PasswordInput from '@/components/PasswordInput';
import { Skeleton } from '@/components/Skeleton';
import { UserIcon, MailIcon, LoaderIcon, AlertCircleIcon, CheckCircleIcon } from '@/components/Icons';

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    async function load() {
      const meRes = await fetch('/api/auth/me');
      if (!meRes.ok) {
        router.push('/auth');
        return;
      }
      const meData = await meRes.json();
      setUser(meData.user);
      setName(meData.user.name);
      setLoading(false);
    }
    load();
  }, [router]);

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setUpdating(true);

    try {
      const body: Record<string, unknown> = {};
      if (name !== user.name) body.name = name;
      if (currentPassword && newPassword) {
        body.currentPassword = currentPassword;
        body.newPassword = newPassword;
      }

      if (Object.keys(body).length === 0) {
        setError('No changes to save.');
        setUpdating(false);
        return;
      }

      const res = await fetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Something went wrong');
        return;
      }

      setUser(data.user);
      setName(data.user.name);
      setCurrentPassword('');
      setNewPassword('');
      setSuccess('Profile updated successfully.');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setUpdating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
        <div className="w-full max-w-md space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-24" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-start justify-center bg-neutral-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Profile</h1>
          <Link
            href="/"
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
          >
            &larr; Dashboard
          </Link>
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-6 flex items-center gap-3 pb-4 border-b border-neutral-100">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
              <UserIcon className="h-6 w-6" />
            </div>
            <div>
              <p className="font-medium text-neutral-900">{user.name}</p>
              <p className="text-sm text-neutral-500">{user.email}</p>
            </div>
          </div>

          <form onSubmit={handleUpdate} className="flex flex-col gap-4">
            <div className="relative">
              <UserIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                required
                className="w-full rounded-lg border border-neutral-300 bg-white py-3 pl-10 pr-3 text-[15px] outline-none transition focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10"
              />
            </div>

            <div className="relative">
              <MailIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="email"
                value={user.email}
                disabled
                className="w-full rounded-lg border border-neutral-200 bg-neutral-50 py-3 pl-10 pr-3 text-[15px] text-neutral-500 outline-none"
              />
            </div>

            <div className="border-t border-neutral-100 pt-4">
              <p className="mb-3 text-sm font-medium text-neutral-700">Change password</p>
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
                  placeholder="New password (min 6 characters)"
                  autoComplete="new-password"
                  minLength={6}
                  showStrength
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
                <AlertCircleIcon className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            {success && (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700">
                <CheckCircleIcon className="h-4 w-4 shrink-0" />
                {success}
              </div>
            )}

            <button
              type="submit"
              disabled={updating}
              className="flex items-center justify-center gap-2 rounded-lg bg-neutral-900 py-3 text-[15px] font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {updating && <LoaderIcon className="h-4 w-4 animate-spin" />}
              {updating ? 'Saving…' : 'Save changes'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
