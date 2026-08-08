import { db } from '../../../../../src/db';
import { chatRoomMembers, chatRooms } from '../../../../../src/schema';
import { getAuthUser } from '../../../../../lib/auth/server';
import { eq, and } from 'drizzle-orm';

export async function POST(
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

  await db
    .update(chatRoomMembers)
    .set({ lastReadAt: new Date() })
    .where(and(eq(chatRoomMembers.roomId, id), eq(chatRoomMembers.userId, user.id)));

  return Response.json({ success: true });
}
