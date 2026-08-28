/* ───────────────────────────────────────────────
   CallStage — the GetStream video surface, shared by all three room types.

   Owns exactly one thing: getting a token from the server, connecting, and
   rendering the participants and the control bar. Everything a specific room
   adds — a roster, a waiting queue, tutor tools, the translated chat sidebar
   — is composed around it by the page, or passed in as `tools` when it needs
   to reach the live `Call` object.

   The video canvas is deliberately dark in both app themes. It is a video
   surface, the Stream stylesheet is dark by design, and the LiveKit room
   this replaces was `bg-black` for the same reason. Documented in
   ui-registry.md rather than left as a silent exception.
   ─────────────────────────────────────────────── */

'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  CallControls,
  PaginatedGridLayout,
  SpeakerLayout,
  StreamCall,
  StreamTheme,
  StreamVideo,
  StreamVideoClient,
  type Call,
} from '@stream-io/video-react-sdk';
import '@stream-io/video-react-sdk/dist/css/styles.css';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/design-tokens';
import { Video, Loader2 } from 'lucide-react';

interface JoinPayload {
  apiKey: string;
  token: string;
  callId: string;
  callType: string;
  userId: string;
  userName: string;
  isTutor: boolean;
}

export interface CallStageProps {
  /** POST endpoint that mints the call token. */
  tokenEndpoint: string;
  /** Body sent to that endpoint. */
  tokenBody?: Record<string, unknown>;
  /** `grid` for a classroom of equals, `speaker` for a 1:1 or an exam. */
  layout?: 'speaker' | 'grid';
  /** Label on the join button. */
  joinLabel?: string;
  /** Copy shown before joining. */
  idleMessage?: string;
  /** Blocks joining (e.g. a learner still waiting in the assessment queue). */
  blocked?: boolean;
  blockedReason?: string;
  /** In-call UI that needs the live call — rendered under the control bar. */
  tools?: (ctx: { call: Call; isTutor: boolean }) => ReactNode;
  onJoined?: (ctx: { isTutor: boolean }) => void;
  onLeave?: () => void;
  className?: string;
}

type Phase = 'idle' | 'connecting' | 'connected' | 'error';

export function CallStage({
  tokenEndpoint,
  tokenBody,
  layout = 'speaker',
  joinLabel = 'Join session',
  idleMessage = 'Ready when you are.',
  blocked = false,
  blockedReason,
  tools,
  onJoined,
  onLeave,
  className,
}: CallStageProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const [client, setClient] = useState<StreamVideoClient | null>(null);
  const [call, setCall] = useState<Call | null>(null);
  const [isTutor, setIsTutor] = useState(false);

  // Held in refs as well so the unmount cleanup can tear down a connection
  // that was established after the effect that registered the cleanup.
  const clientRef = useRef<StreamVideoClient | null>(null);
  const callRef = useRef<Call | null>(null);

  const teardown = useCallback(async () => {
    const activeCall = callRef.current;
    const activeClient = clientRef.current;
    callRef.current = null;
    clientRef.current = null;
    setCall(null);
    setClient(null);
    // Leaving before disconnecting: a client torn down mid-call leaves a
    // ghost participant in the room for the other side to stare at.
    if (activeCall) await activeCall.leave().catch(() => {});
    if (activeClient) await activeClient.disconnectUser().catch(() => {});
  }, []);

  const connect = useCallback(async () => {
    if (blocked) return;
    setPhase('connecting');
    setError('');

    try {
      const res = await fetch(tokenEndpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(tokenBody ?? {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not join this session.');

      const payload = data as JoinPayload;
      const nextClient = new StreamVideoClient({
        apiKey: payload.apiKey,
        user: { id: payload.userId, name: payload.userName },
        token: payload.token,
      });
      clientRef.current = nextClient;

      const nextCall = nextClient.call(payload.callType, payload.callId);
      callRef.current = nextCall;

      await nextCall.join({ create: true });
      await nextCall.camera.enable().catch(() => {});
      await nextCall.microphone.enable().catch(() => {});

      setClient(nextClient);
      setCall(nextCall);
      setIsTutor(payload.isTutor);
      setPhase('connected');
      onJoined?.({ isTutor: payload.isTutor });
    } catch (e) {
      // A connection that failed part-way still holds a socket and possibly
      // the camera. Tear it down so pressing join again starts clean.
      await teardown();
      setError(e instanceof Error ? e.message : 'Could not join this session.');
      setPhase('error');
    }
  }, [blocked, tokenEndpoint, tokenBody, onJoined, teardown]);

  const leave = useCallback(async () => {
    await teardown();
    setPhase('idle');
    onLeave?.();
  }, [teardown, onLeave]);

  // Always tear the connection down on unmount; a call left open keeps the
  // camera light on and bills for a ghost participant.
  useEffect(() => {
    return () => { void teardown(); };
  }, [teardown]);

  if (phase !== 'connected' || !client || !call) {
    return (
      <div
        className={cn(
          'flex min-h-96 flex-col items-center justify-center gap-4 rounded-(--radius-md) border border-dojo-border bg-dojo-surface p-8 text-center',
          className,
        )}
      >
        {phase === 'connecting' ? (
          <>
            <Loader2 className="h-6 w-6 animate-spin text-dojo-accent" />
            <p className="text-sm leading-relaxed text-dojo-text-muted">Connecting…</p>
          </>
        ) : (
          <>
            <p className="text-sm leading-relaxed text-dojo-text-muted">
              {blocked ? (blockedReason ?? 'Not your turn yet.') : (error || idleMessage)}
            </p>
            <Button variant="primary" onClick={connect} disabled={blocked}>
              <Video className="h-4 w-4" /> {joinLabel}
            </Button>
          </>
        )}
      </div>
    );
  }

  return (
    <StreamVideo client={client}>
      <StreamCall call={call}>
        <StreamTheme className={cn('overflow-hidden rounded-(--radius-md) bg-black', className)}>
          <div className="min-h-96">
            {layout === 'grid' ? <PaginatedGridLayout /> : <SpeakerLayout />}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 border-t border-white/10 p-3">
            <CallControls onLeave={() => { void leave(); }} />
          </div>
          {tools && (
            <div className="border-t border-white/10 p-3">{tools({ call, isTutor })}</div>
          )}
        </StreamTheme>
      </StreamCall>
    </StreamVideo>
  );
}
