/* ───────────────────────────────────────────────
   Learner / Tutor switch on the auth pages.

   Links, not state: each role's form is its own
   URL, so the choice survives a reload, a bookmark
   and a back button — which the old in-page toggle
   did not. Admin is deliberately absent; see
   app/auth/admin.
   ─────────────────────────────────────────────── */

'use client';

import Link from 'next/link';
import { GraduationCap, User } from 'lucide-react';
import { cn } from '@/lib/design-tokens';
import { roleSignInPath, roleSignUpPath } from '@/lib/auth/destinations';
import type { UserRole } from '@/lib/auth/roles';
import type { AuthMode } from '@/components/auth/AuthScreen';

const OPTIONS: { role: Extract<UserRole, 'learner' | 'tutor'>; label: string; icon: React.ReactNode }[] = [
  { role: 'learner', label: 'Learner', icon: <User className="h-4 w-4" /> },
  { role: 'tutor', label: 'Tutor', icon: <GraduationCap className="h-4 w-4" /> },
];

export interface AuthRoleTabsProps {
  /** The role whose form is currently on screen. */
  role: UserRole;
  mode: AuthMode;
  /** Carried through so a `?next=` survives the switch. */
  next?: string | null;
}

export function AuthRoleTabs({ role, mode, next }: AuthRoleTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Account type"
      className="mb-8 grid grid-cols-2 gap-1 rounded-xl border border-dojo-border bg-dojo-surface p-1"
    >
      {OPTIONS.map((option) => {
        const active = option.role === role;
        const base = mode === 'signin' ? roleSignInPath(option.role) : roleSignUpPath(option.role);
        const href = next ? `${base}?next=${encodeURIComponent(next)}` : base;

        return (
          <Link
            key={option.role}
            href={href}
            role="tab"
            aria-selected={active}
            className={cn(
              'flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors',
              active
                ? 'bg-dojo-accent text-white'
                : 'text-dojo-text-muted hover:bg-dojo-surface-raised hover:text-dojo-text-primary',
            )}
          >
            {option.icon}
            {option.label}
          </Link>
        );
      })}
    </div>
  );
}
