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
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Badge } from '@/components/ui/Badge';
import { useUser } from '@/lib/auth/user-context';
import {
  LayoutDashboard,
  Compass,
  BarChart3,
  Trophy,
  MessageSquare,
  Calendar,
  Settings,
  LogOut,
  History,
  Crown,
} from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  { label: 'Home',      href: '/home',        icon: LayoutDashboard },
  { label: 'Hub',       href: '/hub',         icon: Compass },
  { label: 'Sessions',  href: '/sessions',    icon: History },
  { label: 'Progress',  href: '/progress',    icon: BarChart3 },
  { label: 'Leaderboard', href: '/leaderboard', icon: Trophy },
  { label: 'Messages',  href: '/messages',    icon: MessageSquare },
  { label: 'Calendar',  href: '/calendar',    icon: Calendar },
  { label: 'Settings',  href: '/settings',    icon: Settings },
];

interface SidebarProps {
  onNavigate?: () => void;
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useUser();

  const isActive = (href: string) => {
    if (href === '/home') return pathname === '/home';
    return pathname.startsWith(href);
  };

  async function handleSignOut() {
    await authClient.signOut();
    router.push('/auth');
    router.refresh();
  }

  const handleClick = (href: string) => {
    if (onNavigate) onNavigate();
  };

  return (
    <aside className="flex h-full w-60 flex-col bg-dojo-sidebar border-r border-dojo-border shrink-0">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2.5 border-b border-dojo-border px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-dojo-accent text-sm font-bold text-white">
          A
        </div>
        <span className="text-lg font-semibold text-dojo-text-primary tracking-tight">
          AI DOJO
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
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

      {/* User Card — bottom of sidebar */}
      <div className="border-t border-dojo-border p-4">
        <div className="flex items-center gap-3">
          <Avatar
            name={user?.name ?? 'Learner'}
            src={user?.avatarSrc}
            color={user?.avatarColor ?? '#2D3BC5'}
            size="md"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-dojo-text-primary truncate">
                {user?.name ?? 'Learner'}
              </p>
              {user?.tier === 'premium' && (
                <Crown className="h-3.5 w-3.5 text-dojo-warning shrink-0" />
              )}
            </div>
            <Badge variant={user?.tier === 'premium' ? 'accent' : 'default'} className="mt-0.5">
              {user?.tier === 'premium' ? 'Premium' : 'Free'}
            </Badge>
          </div>
        </div>
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
