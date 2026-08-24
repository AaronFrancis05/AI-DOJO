/* ───────────────────────────────────────────────
   LiveRoom — LiveKit video room for a tutor booking.
   Connects with a server-minted token from /api/live/token.
   ─────────────────────────────────────────────── */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Room,
  RoomEvent,
  Track,
  ConnectionState,
  type RemoteParticipant,
  type LocalTrackPublication,
  type RemoteTrackPublication,
} from 'livekit-client';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/design-tokens';
import {
  Mic, MicOff, Video, VideoOff, MonitorUp, PhoneOff, Loader2,
} from 'lucide-react';

interface LiveRoomProps {
  bookingId: number;
  /** Called when the participant leaves or the room disconnects. */
  onLeave?: () => void;
}

type Phase = 'idle' | 'connecting' | 'connected' | 'error';

export function LiveRoom({ bookingId, onLeave }: LiveRoomProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [peers, setPeers] = useState<RemoteParticipant[]>([]);

  const roomRef = useRef<Room | null>(null);
  const localVideoRef = useRef<HTMLDivElement>(null);
  const remoteVideoRef = useRef<HTMLDivElement>(null);

  /** Detaches any elements a track publication previously attached. */
  const detach = (pub: LocalTrackPublication | RemoteTrackPublication) => {
    pub.track?.detach().forEach((el) => el.remove());
  };

  const attachTo = useCallback((
    container: HTMLDivElement | null,
    pub: LocalTrackPublication | RemoteTrackPublication,
    muted: boolean,
  ) => {
    if (!container || !pub.track) return;
    const el = pub.track.attach();
    el.className = 'h-full w-full object-cover';
    if (el instanceof HTMLVideoElement) {
      el.muted = muted;
      el.playsInline = true;
    }
    container.replaceChildren(el);
  }, []);

  const connect = useCallback(async () => {
    setPhase('connecting');
    setError('');

    try {
      const res = await fetch('/api/live/token', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bookingId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not join this session.');

      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;

      room
        .on(RoomEvent.TrackSubscribed, (_t, pub, participant) => {
          if (pub.kind === Track.Kind.Video) attachTo(remoteVideoRef.current, pub, false);
          setPeers([...room.remoteParticipants.values()]);
          void participant;
        })
        .on(RoomEvent.TrackUnsubscribed, (_t, pub) => {
          detach(pub);
          setPeers([...room.remoteParticipants.values()]);
        })
        .on(RoomEvent.ParticipantConnected, () => setPeers([...room.remoteParticipants.values()]))
        .on(RoomEvent.ParticipantDisconnected, () => setPeers([...room.remoteParticipants.values()]))
        .on(RoomEvent.Disconnected, () => {
          setPhase('idle');
          onLeave?.();
        })
        .on(RoomEvent.ConnectionStateChanged, (state) => {
          if (state === ConnectionState.Connected) setPhase('connected');
        });

      await room.connect(data.url, data.token);
      await room.localParticipant.setMicrophoneEnabled(true);
      await room.localParticipant.setCameraEnabled(true);

      const camPub = room.localParticipant
        .getTrackPublications()
        .find((p) => p.kind === Track.Kind.Video);
      // The local preview is always muted — playing your own mic back is
      // an echo, not feedback the participant wants.
      if (camPub) attachTo(localVideoRef.current, camPub as LocalTrackPublication, true);

      setPhase('connected');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join this session.');
      setPhase('error');
    }
  }, [bookingId, attachTo, onLeave]);

  const leave = useCallback(async () => {
    await roomRef.current?.disconnect();
    roomRef.current = null;
    setPhase('idle');
    onLeave?.();
  }, [onLeave]);

  const toggleMic = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !micOn;
    await room.localParticipant.setMicrophoneEnabled(next);
    setMicOn(next);
  }, [micOn]);

  const toggleCam = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !camOn;
    await room.localParticipant.setCameraEnabled(next);
    setCamOn(next);
    if (next) {
      const pub = room.localParticipant
        .getTrackPublications()
        .find((p) => p.kind === Track.Kind.Video);
      if (pub) attachTo(localVideoRef.current, pub as LocalTrackPublication, true);
    } else {
      localVideoRef.current?.replaceChildren();
    }
  }, [camOn, attachTo]);

  const toggleShare = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !sharing;
    try {
      await room.localParticipant.setScreenShareEnabled(next);
      setSharing(next);
    } catch {
      // The browser picker was dismissed — leave the button as it was.
    }
  }, [sharing]);

  // Always tear the connection down on unmount; a room left open keeps the
  // camera light on and bills the server for a ghost participant.
  useEffect(() => {
    return () => { void roomRef.current?.disconnect(); };
  }, []);

  if (phase === 'idle' || phase === 'error') {
    return (
      <div className="flex min-h-[24rem] flex-col items-center justify-center gap-4 rounded-[--radius-md] border border-dojo-border bg-dojo-surface p-8 text-center">
        <p className="text-sm leading-relaxed text-dojo-text-muted">
          {error || 'Ready when you are.'}
        </p>
        <Button variant="primary" onClick={connect}>
          <Video className="h-4 w-4" /> Join session
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-[--radius-md] border border-dojo-border bg-black">
        <div ref={remoteVideoRef} className="aspect-video w-full" />

        {peers.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-white/70">
              {phase === 'connecting' ? 'Connecting…' : 'Waiting for the other participant…'}
            </p>
          </div>
        )}

        {/* Self-view, picture-in-picture. */}
        <div
          ref={localVideoRef}
          className={cn(
            'absolute bottom-4 right-4 h-24 w-32 overflow-hidden rounded-lg border border-white/20 bg-black sm:h-32 sm:w-44',
            !camOn && 'hidden',
          )}
        />

        {phase === 'connecting' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <Loader2 className="h-6 w-6 animate-spin text-white" />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button variant={micOn ? 'secondary' : 'danger'} onClick={toggleMic}>
          {micOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
          {micOn ? 'Mute' : 'Unmute'}
        </Button>
        <Button variant={camOn ? 'secondary' : 'danger'} onClick={toggleCam}>
          {camOn ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
          {camOn ? 'Stop video' : 'Start video'}
        </Button>
        <Button variant={sharing ? 'primary' : 'secondary'} onClick={toggleShare}>
          <MonitorUp className="h-4 w-4" /> {sharing ? 'Stop sharing' : 'Share screen'}
        </Button>
        <Button variant="danger" onClick={leave}>
          <PhoneOff className="h-4 w-4" /> Leave
        </Button>
      </div>
    </div>
  );
}
