'use client';

import { Avatar } from '@/components/ui/Avatar';
import { Users, MoreVertical, ArrowLeft } from 'lucide-react';

interface ChatHeaderProps {
  name: string;
  subtitle?: string;
  avatarSrc?: string | null;
  avatarName?: string;
  isGroup: boolean;
  onBack?: () => void;
  onMenu?: () => void;
}

/**
 * Thread + pane header: back caret (mobile), avatar (or group icon),
 * name + optional subtitle ("Writes in 🇯🇵 JA"), and a trailing ⋮ menu.
 */
export function ChatHeader({
  name,
  subtitle,
  avatarSrc,
  avatarName = name,
  isGroup,
  onBack,
  onMenu,
}: ChatHeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-dojo-border bg-dojo-sidebar px-3 md:h-16 md:px-4">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to conversations"
          className="tap-target flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-dojo-text-muted transition-colors hover:bg-dojo-surface-raised hover:text-dojo-text-primary md:hidden"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
      )}

      {isGroup ? (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-dojo-border bg-dojo-surface-raised text-dojo-text-muted">
          <Users className="h-5 w-5" />
        </div>
      ) : (
        <Avatar name={avatarName} src={avatarSrc} size="md" className="h-10 w-10" />
      )}

      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-semibold text-dojo-text-primary md:text-base">{name}</h2>
        {subtitle && (
          <p className="truncate text-xs text-dojo-text-muted">{subtitle}</p>
        )}
      </div>

      {onMenu && (
        <button
          type="button"
          onClick={onMenu}
          aria-label="Room options"
          className="tap-target flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-dojo-text-muted transition-colors hover:bg-dojo-surface-raised hover:text-dojo-text-primary"
        >
          <MoreVertical className="h-5 w-5" />
        </button>
      )}
    </header>
  );
}