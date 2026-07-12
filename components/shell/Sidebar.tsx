/* ───────────────────────────────────────────────
   Sidebar — nav list, active pill, persistent across every route
   ─────────────────────────────────────────────── */

'use client';

import { cn } from '@/lib/design-tokens';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Compass,
  BarChart3,
  Trophy,
  MessageSquare,
  Calendar,
  Settings,
} from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

const navItems: NavItem[] = [
  { label: 'Home',      href: '/home',            icon: LayoutDashboard },
  { label: 'Hub',       href: '/hub',             icon: Compass },
  { label: 'Progress',  href: '/progress',        icon: BarChart3 },
  { label: 'Leaderboard', href: '/leaderboard',   icon: Trophy },
  { label: 'Messages',  href: '/messages',        icon: MessageSquare },
  { label: 'Calendar',  href: '/calendar',        icon: Calendar },
  { label: 'Settings',  href: '/settings',        icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/home') return pathname === '/home';
    return pathname.startsWith(href);
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
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
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

      {/* User card is rendered separately via UserCard */}
    </aside>
  );
}
