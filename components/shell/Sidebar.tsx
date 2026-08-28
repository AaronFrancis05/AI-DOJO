/* ───────────────────────────────────────────────
   Sidebar — nav list, active pill, user card at bottom
   Reads the real authenticated user from UserContext.
   On mobile (<md) rendered inside an off-canvas drawer.
   ─────────────────────────────────────────────── */

'use client';

import { cn } from '@/lib/design-tokens';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth/client';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { NotificationBell } from './NotificationBell';
import { useUser } from '@/lib/auth/user-context';
import { resolveDisplayName } from '@/lib/auth/display-name';
import { useCurrentAvatar } from '@/lib/auth/avatar-context';
import { TUTORS_ENABLED } from '@/lib/tutors/config';
import {
  LayoutDashboard,
  Compass,
  GraduationCap,
  BarChart3,
  Trophy,
  MessageSquare,
  Calendar,
  Settings,
  LogOut,
  History,
  Repeat2,
  Users,
  ShieldCheck,
} from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  { label: 'Home',      href: '/home',        icon: LayoutDashboard },
  ...(TUTORS_ENABLED ? [{ label: 'Tutors', href: '/tutors', icon: Users }] : []),
  { label: 'Hub',       href: '/hub',         icon: Compass },
  { label: 'Courses',   href: '/courses',     icon: GraduationCap },
  { label: 'Review',    href: '/review',      icon: Repeat2 },
  { label: 'Sessions',  href: '/sessions',    icon: History },
  { label: 'Progress',  href: '/progress',    icon: BarChart3 },
  { label: 'Leaderboard', href: '/leaderboard', icon: Trophy },
  { label: 'Messages',  href: '/messages',    icon: MessageSquare },
  { label: 'Calendar',  href: '/calendar',    icon: Calendar },
  { label: 'Settings',  href: '/settings',    icon: Settings },
];

/**
 * What a tutor sees instead.
 *
 * Not the learner nav with Teaching bolted on: Hub, Courses, Review,
 * Sessions, Progress and Leaderboard are all surfaces of someone's own
 * practice, and a tutor has none — the XP and streak they were being offered
 * were permanently zero. Teaching is their home, and Calendar carries the
 * classes, assessments and bookings they run (see `GET /api/calendar`).
 */
const tutorNavItems: NavItem[] = [
  { label: 'Teaching',  href: '/tutor',    icon: GraduationCap },
  { label: 'Messages',  href: '/messages', icon: MessageSquare },
  { label: 'Calendar',  href: '/calendar', icon: Calendar },
  { label: 'Settings',  href: '/settings', icon: Settings },
];

/** Role-gated entries, appended for whoever holds the role. Hiding the link
 *  is convenience only — /admin and /tutor re-check the role server-side. */
const adminNavItem: NavItem = { label: 'Admin', href: '/admin', icon: ShieldCheck };
const tutorNavItem: NavItem = { label: 'Teaching', href: '/tutor', icon: GraduationCap };

interface SidebarProps {
  onNavigate?: () => void;
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useUser();
  const currentAvatarUrl = useCurrentAvatar();
  // Honest identity: stored name → email local-part → "You" (never a fake
  // placeholder name like 'Learner').
  const displayName = resolveDisplayName(user);
  // A tutor gets the teaching nav; an admin keeps the learner one with both
  // consoles appended, because admin satisfies every role (see satisfiesRole
  // in lib/auth/roles.ts) and moderating learner surfaces means reaching them.
  const isTutor = TUTORS_ENABLED && user?.role === 'tutor';
  const items = isTutor
    ? tutorNavItems
    : [
        ...navItems,
        ...(TUTORS_ENABLED && user?.role === 'admin' ? [tutorNavItem] : []),
        ...(user?.role === 'admin' ? [adminNavItem] : []),
      ];

  const isActive = (href: string) => {
    if (href === '/home') return pathname === '/home';
    return pathname.startsWith(href);
  };

  async function handleSignOut() {
    await authClient.signOut();
    window.location.href = '/auth/signin?signed_out=1';
  }

  const handleClick = (href: string) => {
    if (onNavigate) onNavigate();
  };

  return (
    <aside className="flex h-full w-60 flex-col bg-dojo-sidebar border-r border-dojo-border shrink-0">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2.5 border-b border-dojo-border pl-14 pr-14 md:pl-5 md:pr-5 justify-center md:justify-start">
        <img src="/logo.png" alt="" className="h-8 w-8 rounded-lg object-cover" />
        <span className="text-lg font-semibold text-dojo-text-primary tracking-tight">
          AI DOJO
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {items.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => handleClick(item.href)}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-dojo-accent text-white'
                  : 'text-dojo-text-muted hover:bg-dojo-surface hover:text-dojo-text-primary',
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Notifications — sits with the nav, opens upward over it */}
      <div className="px-3 pb-2">
        <NotificationBell onNavigate={onNavigate} />
      </div>

      {/* User Card — bottom of sidebar */}
      <div className="border-t border-dojo-border p-4">
        <div className="flex items-center gap-3">
          <Avatar
            name={displayName}
            src={currentAvatarUrl ?? user?.avatarSrc}
            color={user?.avatarColor ?? '#2D3BC5'}
            size="md"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-dojo-text-primary truncate">
              {displayName}
            </p>
          </div>
        </div>
        {/* A tutor earns no XP, so the learner's level bar read "0 / 1000"
            forever. Their standing is whether learners can see them yet. */}
        {isTutor ? (
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-dojo-text-muted">Tutor</span>
            {/* Rejected is its own answer: it used to read "Pending review",
                which told a tutor to keep waiting for a decision already made. */}
            <Badge
              variant={
                user?.tutorStatus === 'verified'
                  ? 'success'
                  : user?.tutorStatus === 'rejected'
                    ? 'default'
                    : 'outline'
              }
            >
              {user?.tutorStatus === 'verified'
                ? 'Verified'
                : user?.tutorStatus === 'rejected'
                  ? 'Not approved'
                  : 'Pending review'}
            </Badge>
          </div>
        ) : (
          <div className="mt-3 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-dojo-text-muted">
                Level {user?.level ?? '-'}
              </span>
              <span className="text-xs text-dojo-text-muted">
                {user?.xp ?? 0} / {user?.xpToNext ?? 1000} XP
              </span>
            </div>
            <ProgressBar
              value={user?.xp ?? 0}
              max={user?.xpToNext ?? 1000}
              color="accent"
              size="sm"
            />
          </div>
        )}
      </div>

      {/* Sign Out */}
      <div className="px-3 pb-2">
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-dojo-text-muted hover:bg-dojo-surface hover:text-dojo-danger transition-colors"
        >
          <LogOut className="h-5 w-5 shrink-0" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
