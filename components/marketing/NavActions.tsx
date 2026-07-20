'use client';

import Link from 'next/link';
import { useTheme } from '@/components/theme/ThemeProvider';

export function NavActions() {
  const { theme, toggle } = useTheme();

  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <button
        onClick={toggle}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-dojo-border text-dojo-text-muted transition-colors hover:text-dojo-text-primary hover:border-dojo-accent/50"
        aria-label="Toggle theme"
      >
        {theme === 'dark' ? (
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
        ) : (
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        )}
      </button>
      <Link
        href="/auth"
        className="rounded-lg px-3 py-2 text-sm font-medium text-dojo-text-muted transition-colors hover:text-dojo-text-primary sm:px-4"
      >
        Sign in
      </Link>
      <Link
        href="/auth"
        className="rounded-full bg-dojo-accent px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-dojo-accent/90 sm:px-5 sm:py-2.5"
      >
        Get Started
      </Link>
    </div>
  );
}