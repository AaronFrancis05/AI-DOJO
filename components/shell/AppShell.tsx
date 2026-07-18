/* ───────────────────────────────────────────────
   AppShell — sidebar + content slot, wraps every (app) route.
   EXCEPTION: /session/* routes are rendered full-screen
   (no sidebar, no scroll container) so the immersive
   roleplay canvas can fill the entire viewport.
   ─────────────────────────────────────────────── */

'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { useUser } from '@/lib/auth/user-context';
import { AvatarProvider } from '@/lib/auth/avatar-context';
import { Menu, X } from 'lucide-react';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  // Session pages are full-screen immersive — no sidebar, no scroll wrapper
  const isSessionRoute = pathname.startsWith('/session/');

  if (isSessionRoute) {
    return (
      <div className="h-dvh w-screen overflow-hidden bg-dojo-canvas text-dojo-text-primary">
        <AvatarProvider>{children}</AvatarProvider>
      </div>
    );
  }

  return (
    <div className="flex h-dvh w-screen bg-dojo-canvas text-dojo-text-primary overflow-hidden">
      {/* Mobile hamburger */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="fixed left-3 top-3 z-50 flex h-9 w-9 items-center justify-center rounded-lg bg-dojo-sidebar border border-dojo-border md:hidden"
        aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
      >
        {sidebarOpen ? <X className="h-5 w-5 text-dojo-text-primary" /> : <Menu className="h-5 w-5 text-dojo-text-primary" />}
      </button>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <div
        className={`${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } fixed inset-y-0 left-0 z-40 transition-transform duration-200 md:relative md:translate-x-0`}
      >
        <Sidebar onNavigate={() => setSidebarOpen(false)} />
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <AvatarProvider>{children}</AvatarProvider>
      </main>
    </div>
  );
}
