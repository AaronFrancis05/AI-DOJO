'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { MessageSquare, Volume2, User } from 'lucide-react';

type SessionMode = 'chat' | 'voice' | 'avatar';

interface SessionModeTabsProps {
  sessionId: number;
  active: SessionMode;
}

const TABS: { key: SessionMode; label: string; icon: typeof MessageSquare }[] = [
  { key: 'chat', label: 'Chat', icon: MessageSquare },
  { key: 'voice', label: 'Voice', icon: Volume2 },
  { key: 'avatar', label: 'Avatar', icon: User },
];

export function SessionModeTabs({ sessionId, active }: SessionModeTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();

  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-dojo-border bg-dojo-surface/80 p-0.5">
      {TABS.map(({ key, label, icon: Icon }) => {
        const isActive = key === active;
        return (
          <button
            key={key}
            type="button"
            onClick={() => router.push(queryString ? `/session/${sessionId}/${key}?${queryString}` : `/session/${sessionId}/${key}`)}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-all ${
              isActive
                ? 'bg-dojo-accent text-white shadow-sm'
                : 'text-dojo-text-muted hover:text-dojo-text-primary'
            }`}
          >
            <Icon className="h-3 w-3" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
