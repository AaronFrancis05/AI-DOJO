'use client';

import { cn } from '@/lib/design-tokens';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Users, Languages, ShieldCheck } from 'lucide-react';
import { langFlag, type ChatRoomDetail } from '@/lib/chat-types';

interface RoomDetailsPanelProps {
  room: ChatRoomDetail | null;
  myId?: string;
  className?: string;
}

/**
 * Right-hand "Details" pane (Reference 3, repurposed for translation).
 * Shows the room's members with their language, and the current
 * condition of auto-translation (configured vs unavailable).
 */
export function RoomDetailsPanel({ room, myId, className }: RoomDetailsPanelProps) {
  const members = room?.members ?? [];
  const others = members.filter((m) => m.id !== myId);

  return (
    <aside className={cn('hidden w-72 shrink-0 flex-col overflow-y-auto border-l border-dojo-border bg-dojo-sidebar lg:flex', className)}>
      <div className="flex items-center gap-2 border-b border-dojo-border px-4 py-3">
        <Users className="h-4 w-4 text-dojo-text-muted" />
        <h3 className="text-sm font-semibold text-dojo-text-primary">Details</h3>
      </div>

      <div className="flex-1 space-y-5 px-4 py-4">
        {/* Members */}
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-dojo-text-muted">
            {room?.isGroup ? `${members.length} members` : 'Contact'}
          </h4>
          <div className="space-y-3">
            {others.map((m) => {
              const lang = langFlag(m.language);
              return (
                <div key={m.id} className="flex items-center gap-3">
                  <Avatar name={m.name} src={m.avatarSrc} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-dojo-text-primary">{m.name}</p>
                    <p className="flex items-center gap-1 text-xs text-dojo-text-muted">
                      <span className="text-sm leading-none">{lang.flag}</span>
                      {lang.nativeName} · {m.language.toUpperCase()}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Translation status */}
        <section className="rounded-[--radius-md] border border-dojo-border bg-dojo-surface p-3">
          <div className="mb-1.5 flex items-center gap-2">
            <Languages className="h-4 w-4 text-dojo-accent" />
            <h4 className="text-xs font-semibold text-dojo-text-primary">Translation</h4>
          </div>
          <p className="text-xs leading-relaxed text-dojo-text-muted">
            {room?.translationConfigured ? (
              <>Messages are auto-translated via the UgaJapa engine so every member reads the chat in their own language. Voice messages are transcribed and translated too.</>
            ) : (
              <>Translation is not configured — messages will appear in their original language.</>
            )}
          </p>
          <div className="mt-2">
            {room?.translationConfigured ? (
              <Badge variant="success">Auto-translating</Badge>
            ) : (
              <Badge variant="outline">Translation unavailable</Badge>
            )}
          </div>
        </section>

        {/* Member languages summary */}
        <section>
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-dojo-text-muted">
            <ShieldCheck className="h-4 w-4" />
            Languages in this room
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {Array.from(new Set(members.map((m) => m.language))).map((code) => {
              const l = langFlag(code);
              return (
                <span
                  key={code}
                  className="inline-flex items-center gap-1 rounded-full border border-dojo-border bg-dojo-surface px-2.5 py-1 text-xs text-dojo-text-primary"
                >
                  <span className="text-sm leading-none">{l.flag}</span>
                  {code.toUpperCase()}
                </span>
              );
            })}
          </div>
        </section>
      </div>
    </aside>
  );
}