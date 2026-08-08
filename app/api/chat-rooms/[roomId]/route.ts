import { db } from '../../../../src/db';
import {
  chatRooms,
  chatRoomMembers,
  users,
} from '../../../../src/schema';
import { getAuthUser } from '../../../../lib/auth/server';
import { eq, and } from 'drizzle-orm';
import { isUgaJapaConfigured } from '../../../../lib/ugajapa';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const user = await getAuthUser();
  if (!user) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { roomId } = await params;
  const id = Number(roomId);
  if (isNaN(id)) {
    return Response.json({ error: 'Invalid room ID' }, { status: 400 });
  }

  const [room] = await db.select().from(chatRooms).where(eq(chatRooms.id, id));
  if (!room) {
    return Response.json({ error: 'Room not found' }, { status: 404 });
  }

  const [membership] = await db
    .select()
    .from(chatRoomMembers)
    .where(and(eq(chatRoomMembers.roomId, id), eq(chatRoomMembers.userId, user.id)));
  if (!membership) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const memberRows = await db
    .select({
      id: chatRoomMembers.userId,
      userId: chatRoomMembers.userId,
      preferredLanguage: chatRoomMembers.preferredLanguage,
      name: users.name,
      email: users.email,
      avatarSrc: users.avatarSrc,
      nativeLanguage: users.nativeLanguage,
    })
    .from(chatRoomMembers)
    .innerJoin(users, eq(chatRoomMembers.userId, users.id))
    .where(eq(chatRoomMembers.roomId, id));

  return Response.json({
    success: true,
    room: {
      id: room.id,
      name: room.name,
      isGroup: room.isGroup,
      createdAt: room.createdAt,
      translationConfigured: isUgaJapaConfigured(),
      members: memberRows.map((m) => ({
        id: m.userId,
        name: m.name ?? 'Unknown',
        avatarSrc: m.avatarSrc,
        email: m.email,
        language: m.preferredLanguage ?? m.nativeLanguage ?? 'en',
      })),
    },
  });
}
