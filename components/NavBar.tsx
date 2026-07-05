'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { authClient } from '@/lib/auth/client';
import { UserIcon, ListIcon, LogOutIcon, LoaderIcon } from './Icons';
import { useState } from 'react';

export default function NavBar() {
  const router = useRouter();
  const pathname = usePathname();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    await authClient.signOut();
    router.push('/auth');
    router.refresh();
  }

  const linkClass = (path: string) =>
    `flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
      pathname === path
        ? 'bg-neutral-900 text-white'
        : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
    }`;

  return (
    <nav className="sticky top-0 z-50 border-b border-neutral-200 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-1">
          <Link
            href="/"
            className="mr-4 text-lg font-semibold tracking-tight text-neutral-900"
          >
            🥋 AI DOJO
          </Link>
          <Link href="/sessions" className={linkClass('/sessions')}>
            <ListIcon className="h-4 w-4" />
            Sessions
          </Link>
          <Link href="/auth/profile" className={linkClass('/auth/profile')}>
            <UserIcon className="h-4 w-4" />
            Profile
          </Link>
        </div>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-neutral-600 transition hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
        >
          {loggingOut ? (
            <LoaderIcon className="h-4 w-4" />
          ) : (
            <LogOutIcon className="h-4 w-4" />
          )}
          Log out
        </button>
      </div>
    </nav>
  );
}
