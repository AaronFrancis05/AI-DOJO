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
import { NamePromptDialog } from './NamePromptDialog';
import { useUser } from '@/lib/auth/user-context';
import { resolveDisplayName } from '@/lib/auth/display-name';
import { AvatarProvider } from '@/lib/auth/avatar-context';
import { PageTitleProvider, usePageTitleValue } from '@/lib/hooks/PageTitleContext';
import { Menu, X } from 'lucide-react';

interface AppShellProps {
  children: React.ReactNode;
}

function MobileTopBar({ onToggle, sidebarOpen }: { onToggle: () => void; sidebarOpen: boolean }) {
  const title = usePageTitleValue();
  return (
    <div className="md:hidden fixed inset-x-0 top-0 z-50 flex h-14 items-center bg-dojo-sidebar border-b border-dojo-border px-3">
      <button
        onClick={onToggle}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
        aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
      >
        {sidebarOpen ? <X className="h-5 w-5 text-dojo-text-primary" /> : <Menu className="h-5 w-5 text-dojo-text-primary" />}
      </button>
      <h1 className="flex-1 text-center text-base font-semibold text-dojo-text-primary truncate px-2">
        {title}
      </h1>
      <div className="h-9 w-9 shrink-0" aria-hidden="true" />
    </div>
  );
}

export function AppShell({ children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const user = useUser();

  // Session pages are full-screen immersive — no sidebar, no scroll wrapper
  const isSessionRoute = pathname.startsWith('/session/');

  // Every signed-in account must carry its real name — unnamed accounts (and
  // rows still carrying the legacy 'Learner' stamp) are asked once, here.
  const needsDisplayName = !!user && !resolveDisplayName(user);

  if (isSessionRoute) {
    return (
      <div className="h-dvh w-screen overflow-hidden bg-dojo-canvas text-dojo-text-primary">
        <AvatarProvider>{children}</AvatarProvider>
      </div>
    );
  }

  return (
    <PageTitleProvider>
      <div className="flex h-dvh w-screen bg-dojo-canvas text-dojo-text-primary overflow-hidden">
        {/* One-time display-name gate */}
        {needsDisplayName && <NamePromptDialog />}
        {/* Mobile top bar with centered title */}
        <MobileTopBar onToggle={() => setSidebarOpen(!sidebarOpen)} sidebarOpen={sidebarOpen} />

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
        <main className="flex-1 overflow-y-auto pt-14 md:pt-0">
          <AvatarProvider>{children}</AvatarProvider>
        </main>
      </div>
    </PageTitleProvider>
  );
}
