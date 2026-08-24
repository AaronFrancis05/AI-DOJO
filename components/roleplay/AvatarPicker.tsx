'use client';

import { useMemo, useState } from 'react';
import { AVATAR_SOURCES, type AvatarSource } from '@/lib/avatar/catalog';
import { cn } from '@/lib/design-tokens';
import { Search, Check } from 'lucide-react';

interface AvatarPickerProps {
  selectedId?: string | null;
  onSelect: (avatar: AvatarSource) => void;
  className?: string;
}

/**
 * Catalog grid — ported from ai-avatar-ui/src/components/AvatarPickerCore.js
 * Uses AI DOJO design tokens (bg-dojo-*, text-dojo-*, border-dojo-*) and
 * thumbnails from public/ai-avatars/thumbnails/*.webp.
 */
export function AvatarPicker({ selectedId, onSelect, className }: AvatarPickerProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return AVATAR_SOURCES;
    return AVATAR_SOURCES.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q) ||
        a.persona.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dojo-text-muted" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search avatars — e.g. Apio, casual, coordinator…"
          className="h-10 w-full rounded-xl border border-dojo-border bg-dojo-surface-raised pl-10 pr-4 text-sm text-dojo-text-primary placeholder:text-dojo-text-muted/50 outline-none focus:border-dojo-accent/40"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {filtered.map((avatar) => {
          const selected = avatar.id === selectedId;
          return (
            <button
              key={avatar.id}
              type="button"
              onClick={() => onSelect(avatar)}
              className={cn(
                'group relative flex flex-col overflow-hidden rounded-xl border bg-dojo-surface-raised text-left transition-colors',
                selected
                  ? 'border-dojo-accent ring-1 ring-dojo-accent'
                  : 'border-dojo-border hover:border-dojo-accent/40',
              )}
            >
              <div className="relative aspect-[4/3] w-full overflow-hidden bg-dojo-canvas">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={avatar.thumbnail}
                  alt={avatar.name}
                  className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.02]"
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
                {selected && (
                  <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-dojo-accent text-white shadow">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                )}
              </div>
              <div className="p-3">
                <p className="text-sm font-semibold leading-none text-dojo-text-primary">{avatar.name}</p>
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-dojo-text-muted">{avatar.persona}</p>
                <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-dojo-text-muted/60">{avatar.id}</p>
              </div>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p className="py-8 text-center text-sm text-dojo-text-muted">No avatars match “{query}”.</p>
      )}

      <p className="text-xs text-dojo-text-muted">
        {filtered.length} of {AVATAR_SOURCES.length} avatars — from ai-avatar-ui catalog, served from{' '}
        <code className="rounded bg-dojo-surface px-1 py-0.5">/ai-avatars/models/*.glb</code>
      </p>
    </div>
  );
}
