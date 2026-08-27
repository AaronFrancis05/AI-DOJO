/* ───────────────────────────────────────────────
   ClassRoom — one tutor, many learners.

   The video surface is CallStage; everything here is what makes it a
   classroom rather than a call: a grid layout, the tutor's mute-all and
   spotlight, the roster, and the translated text sidebar.
   ─────────────────────────────────────────────── */

'use client';

import { useCallback, useState } from 'react';
import { useCallStateHooks, type Call } from '@stream-io/video-react-sdk';
import { CallStage } from './CallStage';
import { RoomChatPanel } from './RoomChatPanel';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { langFlag } from '@/lib/chat-types';
import { MicOff, Pin, PinOff, Users } from 'lucide-react';

export interface RosterEntry {
  learnerId: string;
  name: string;
  avatarSrc: string | null;
  nativeLanguage: string | null;
  status: string;
}

interface ClassRoomProps {
  classId: number;
  chatRoomId: number | null;
  roster: RosterEntry[];
  canJoin: boolean;
  joinBlockedReason: string | null;
}

/**
 * The tutor's in-call controls.
 *
 * Inside CallStage's providers, so the Stream hooks resolve. Spotlight is
 * `pinForEveryone`, not a local pin: the point of spotlighting a learner
 * mid-lesson is that the rest of the class looks at them too.
 */
function TutorTools({ call }: { call: Call }) {
  const { useParticipants } = useCallStateHooks();
  const participants = useParticipants();
  const [busy, setBusy] = useState(false);
  const [spotlighted, setSpotlighted] = useState<string | null>(null);

  const muteAll = useCallback(async () => {
    setBusy(true);
    try {
      await call.muteAllUsers('audio');
    } catch {
      // Stream refused (permissions, or the call already ended) — the button
      // simply does nothing rather than throwing into the room.
    } finally {
      setBusy(false);
    }
  }, [call]);

  const toggleSpotlight = useCallback(
    async (sessionId: string, userId: string) => {
      setBusy(true);
      try {
        if (spotlighted === sessionId) {
          await call.unpinForEveryone({ user_id: userId, session_id: sessionId });
          setSpotlighted(null);
        } else {
          await call.pinForEveryone({ user_id: userId, session_id: sessionId });
          setSpotlighted(sessionId);
        }
      } catch {
        // as above
      } finally {
        setBusy(false);
      }
    },
    [call, spotlighted],
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={muteAll}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-(--radius-md) border border-white/20 px-3 py-2 text-sm text-white transition-colors hover:bg-white/10 disabled:opacity-50"
      >
        <MicOff className="h-4 w-4" /> Mute everyone
      </button>

      {participants
        .filter((p) => !p.isLocalParticipant)
        .map((p) => (
          <button
            key={p.sessionId}
            type="button"
            onClick={() => toggleSpotlight(p.sessionId, p.userId)}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-(--radius-md) border border-white/20 px-3 py-2 text-sm text-white transition-colors hover:bg-white/10 disabled:opacity-50"
          >
            {spotlighted === p.sessionId ? (
              <PinOff className="h-4 w-4" />
            ) : (
              <Pin className="h-4 w-4" />
            )}
            <span className="max-w-32 truncate">{p.name || p.userId}</span>
          </button>
        ))}
    </div>
  );
}

export function ClassRoom({
  classId,
  chatRoomId,
  roster,
  canJoin,
  joinBlockedReason,
}: ClassRoomProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-4">
        <CallStage
          tokenEndpoint={`/api/live/class/${classId}/token`}
          layout="grid"
          joinLabel="Join class"
          idleMessage="Your camera and microphone start on. You can turn either off once you're in."
          blocked={!canJoin}
          blockedReason={joinBlockedReason ?? undefined}
          tools={({ call, isTutor }) => (isTutor ? <TutorTools call={call} /> : null)}
        />

        <Card className="!p-4">
          <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-dojo-text-muted">
            <Users className="h-3.5 w-3.5" />
            Roster · {roster.length}
          </h2>
          {roster.length === 0 ? (
            <p className="mt-3 text-sm text-dojo-text-muted">Nobody has enrolled yet.</p>
          ) : (
            <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {roster.map((r) => {
                const lang = langFlag(r.nativeLanguage);
                return (
                  <li key={r.learnerId} className="flex items-center gap-2">
                    <Avatar name={r.name} src={r.avatarSrc ?? undefined} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm text-dojo-text-primary">
                      {r.name}
                    </span>
                    {lang.flag && (
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        {lang.flag} {(r.nativeLanguage ?? '').toUpperCase()}
                      </Badge>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <RoomChatPanel key={chatRoomId ?? 'none'} roomId={chatRoomId} className="h-[32rem] lg:h-auto lg:max-h-[calc(100dvh-10rem)]" />
    </div>
  );
}
