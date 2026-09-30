/* ───────────────────────────────────────────────
   Sidebar — nav list, active pill, user card at bottom
   Reads the real authenticated user from UserContext.
   On mobile (<md) rendered inside an off-canvas drawer.
   ─────────────────────────────────────────────── */

'use client';

import { cn } from '@/lib/design-tokens';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
  Building2,
} from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavSection {
  id: string;
  /** Section heading. `null` = ungrouped cluster (Home, or Calendar/Messages/Settings). */
  label: string | null;
  items: NavItem[];
}

const homeItem: NavItem = { label: 'Home', href: '/home', icon: LayoutDashboard };
const tutorsItem: NavItem = { label: 'Tutors', href: '/tutors', icon: Users };
const libraryItem: NavItem = { label: 'Library', href: '/library', icon: Compass };
const coursesItem: NavItem = { label: 'Courses', href: '/courses', icon: GraduationCap };
const reviewItem: NavItem = { label: 'Review', href: '/review', icon: Repeat2 };

const resultsItems: NavItem[] = [
  { label: 'Sessions',    href: '/sessions',    icon: History },
  { label: 'Progress',    href: '/progress',    icon: BarChart3 },
  { label: 'Leaderboard', href: '/leaderboard', icon: Trophy },
];

const connectItems: NavItem[] = [
  { label: 'Calendar', href: '/calendar', icon: Calendar },
  { label: 'Messages', href: '/messages', icon: MessageSquare },
];
const settingsItem: NavItem = { label: 'Settings', href: '/settings', icon: Settings };

/**
 * What a tutor sees instead.
 *
 * Not the learner nav with Teaching bolted on: Library, Courses, Review,
 * Sessions, Progress and Leaderboard are all surfaces of someone's own
 * practice, and a tutor has none — the XP and streak they were being offered
 * were permanently zero. Teaching is their home, and Calendar carries the
 * live lessons, assessments and bookings they run (see `GET /api/calendar`).
 */
const tutorNavItems: NavItem[] = [
  { label: 'Teaching',  href: '/tutor',    icon: GraduationCap },
  { label: 'Calendar',  href: '/calendar', icon: Calendar },
  { label: 'Messages',  href: '/messages', icon: MessageSquare },
  { label: 'Settings',  href: '/settings', icon: Settings },
];

/** Role-gated consoles. Admin / Teaching sit above Home; Organization
 *  stays before Settings. Hiding the link is convenience only — /admin
 *  and /tutor re-check the role server-side. */
const adminNavItem: NavItem = { label: 'Admin', href: '/admin', icon: ShieldCheck };
const tutorNavItem: NavItem = { label: 'Teaching', href: '/tutor', icon: GraduationCap };
const organizationNavItem: NavItem = { label: 'Organization', href: '/organization', icon: Building2 };

interface SidebarProps {
  onNavigate?: () => void;
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const user = useUser();
  const currentAvatarUrl = useCurrentAvatar();
  // Honest identity: stored name → email local-part → "You" (never a fake
  // placeholder name like 'Learner').
  const displayName = resolveDisplayName(user);
  // A tutor gets the teaching nav. An admin keeps the learner destinations
  // (they moderate those surfaces) but leads with Admin then Teaching, then
  // Home — Settings is always last. admin satisfies every role (see
  // satisfiesRole in lib/auth/roles.ts) but the nav is not the tutor one.
  const isTutor = TUTORS_ENABLED && user?.role === 'tutor';
  const isAdmin = user?.role === 'admin';
  const practiceItems: NavItem[] = [
    libraryItem,
    coursesItem,
    ...(TUTORS_ENABLED && user?.canBrowseTutors ? [tutorsItem] : []),
    reviewItem,
  ];
  const consoles: NavItem[] = isTutor
    ? []
    : [
        ...(isAdmin ? [adminNavItem] : []),
        ...(TUTORS_ENABLED && isAdmin ? [tutorNavItem] : []),
      ];
  const organizationItems =
    !isTutor && user?.organizationAdmin ? [organizationNavItem] : [];
  const sections: NavSection[] = isTutor
    ? [{ id: 'tutor', label: null, items: tutorNavItems }]
    : [
        { id: 'top', label: null, items: [...consoles, homeItem] },
        { id: 'practice', label: 'Practice', items: practiceItems },
        { id: 'results', label: 'Results', items: resultsItems },
        { id: 'chrome', label: null, items: [...connectItems, ...organizationItems, settingsItem] },
      ];

  const isActive = (href: string) => {
    if (href === '/home') return pathname === '/home';
    // `/tutor` must not light up on `/tutors` (the learner catalogue).
    if (href === '/tutor') return pathname === '/tutor' || pathname.startsWith('/tutor/');
    return pathname.startsWith(href);
  };

  async function handleSignOut() {
    await authClient.signOut();
    window.location.href = '/auth/signin?signed_out=1';
  }

  const handleClick = () => {
    if (onNavigate) onNavigate();
  };

  return (
    <aside className="flex h-full w-60 flex-col bg-dojo-sidebar border-r border-dojo-border shrink-0">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2.5 border-b border-dojo-border pl-14 pr-14 md:pl-5 md:pr-5 justify-center md:justify-start">
        <Image src="/logo.png" alt="" width={32} height={32} className="h-8 w-8 rounded-lg object-cover" />
        <span className="text-lg font-semibold text-dojo-text-primary tracking-tight">
          AI DOJO
        </span>
      </div>

      {/* Nav — learner destinations are grouped under Practice / Results
          headings. Tutor nav stays a flat list (four items, grouping would
          only add noise). Headings are labels, not collapsible. */}
      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
        {sections.map((section) => (
          <div
            key={section.id}
            className="space-y-1"
            role={section.label ? 'group' : undefined}
            aria-labelledby={section.label ? `sidebar-nav-${section.id}` : undefined}
          >
            {section.label && (
              <p
                id={`sidebar-nav-${section.id}`}
                className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-dojo-text-muted"
              >
                {section.label}
              </p>
            )}
            {section.items.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={handleClick}
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
          </div>
        ))}
      </nav>

      {/* Notifications — sits with the nav, opens upward over it */}
      <div className="px-3 pb-2">
        <NotificationBell onNavigate={onNavigate} />
      </div>

      {/* Identity row opens the profile page. Level/XP and the tutor badge
          stay put — that page does not show them. */}
      <div className="border-t border-dojo-border p-4">
        <Link
          href="/profile"
          onClick={handleClick}
          className="-mx-2 -mt-2 flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-dojo-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dojo-accent"
        >
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
            {user?.organizationName && (
              <p className="truncate text-xs text-dojo-text-muted">
                {user.organizationName}
              </p>
            )}
          </div>
        </Link>
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
