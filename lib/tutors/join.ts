/**
 * The one shape a client needs to join any of the three room types.
 *
 * Bookings, classes and assessments differ entirely in who may join and
 * when, and not at all in what a joiner then needs. Keeping the payload in
 * one place is what lets `components/tutors/CallStage.tsx` be a single
 * component the three room pages configure, rather than three near-copies.
 */

import { StreamClient } from '@stream-io/node-sdk';
import { getStreamConfig, TUTORS_ENABLED } from './config';
import { createCallToken, streamUserId } from './rooms';

export interface JoinPayload {
  success: true;
  /** Public — identifies the app; the token is what grants access. */
  apiKey: string;
  token: string;
  callId: string;
  callType: string;
  /** The identity the token was minted for; the client must connect as it. */
  userId: string;
  userName: string;
  isTutor: boolean;
}

export interface JoinPrincipal {
  id: string;
  name?: string | null;
}

/**
 * Mints the join payload, or returns a Response describing why it could not.
 *
 * Returning the failure as a Response rather than throwing keeps each route
 * a straight line: `const r = await buildJoinPayload(...); if (r instanceof
 * Response) return r;`.
 *
 * Callers MUST have already established that this user belongs in this room
 * and that the join window is open — none of that is re-checked here.
 */
export async function buildJoinPayload(args: {
  callId: string;
  callType: string;
  user: JoinPrincipal;
  /** The tutor who owns the room. The call is created as them, never as a joiner. */
  ownerUserId: string;
  ownerName?: string | null;
  isTutor: boolean;
}): Promise<JoinPayload | Response> {
  if (!TUTORS_ENABLED) {
    return Response.json({ error: 'Live tutoring is not enabled.' }, { status: 404 });
  }

  const config = getStreamConfig();
  if (!config) {
    return Response.json(
      { error: 'Live tutoring is not configured on this server.' },
      { status: 503 },
    );
  }

  const token = createCallToken({
    callType: args.callType,
    callId: args.callId,
    userId: args.user.id,
    isTutor: args.isTutor,
  });

  if (!token) {
    return Response.json(
      { error: 'Live tutoring is not configured on this server.' },
      { status: 503 },
    );
  }

  const joinerId = streamUserId(args.user.id);
  const ownerId = streamUserId(args.ownerUserId);

  // Two things are established server-side before the client connects.
  //
  //  1. The joining user exists in Stream with a real name, so the video tile
  //     is labelled rather than showing a raw id.
  //  2. The call exists, created BY THE TUTOR. The client also passes
  //     `create: true`, and without this the first learner through the door
  //     would become the call's creator — which on the default call type
  //     carries capabilities (ending the call, for one) that no learner
  //     should hold in their own assessment.
  //
  // Best-effort: a transient Stream error here must not deny a token, since
  // the client's own `create: true` still gets people into the room.
  try {
    const client = new StreamClient(config.apiKey, config.apiSecret);
    await client.upsertUsers([
      { id: joinerId, name: args.user.name ?? 'Participant' },
      ...(joinerId === ownerId
        ? []
        : [{ id: ownerId, name: args.ownerName ?? 'Tutor' }]),
    ]);
    await client.video
      .call(args.callType, args.callId)
      .getOrCreate({ data: { created_by_id: ownerId } });
  } catch (err) {
    console.warn(
      '[tutors] could not pre-create the Stream call:',
      err instanceof Error ? err.message : String(err),
    );
  }

  return {
    success: true,
    apiKey: config.apiKey,
    token,
    callId: args.callId,
    callType: args.callType,
    userId: joinerId,
    userName: args.user.name ?? 'Participant',
    isTutor: args.isTutor,
  };
}
