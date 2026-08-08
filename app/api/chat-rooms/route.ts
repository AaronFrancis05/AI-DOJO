import { db } from '../../../src/db';
import {
  chatRooms,
  chatRoomMembers,
  users,
} from '../../../src/schema';
import { getAuthUser } from '../../../lib/auth/server';
import { eq, inArray, sql } from 'drizzle-orm';

type MemberRow = {
  id: number;
  roomId: number;
  userId: string;
  preferredLanguage: string | null;
  lastReadAt: string | null;
  joinedAt: string;
  name: string | null;
  email: string | null;
  avatarSrc: string | null;
  nativeLanguage: string | null;
};

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const myMemberships = await db
    .select()
    .from(chatRoomMembers)
    .where(eq(chatRoomMembers.userId, user.id));

  const roomIds = myMemberships.map((m) => m.roomId);

  if (roomIds.length === 0) {
    return Response.json({ success: true, rooms: [] });
  }

  // Load rooms + all members (joined to users) for those room IDs.
  const [rooms, members] = await Promise.all([
    db.select().from(chatRooms).where(inArray(chatRooms.id, roomIds)),
    db
      .select({
        id: chatRoomMembers.id,
        roomId: chatRoomMembers.roomId,
        userId: chatRoomMembers.userId,
        preferredLanguage: chatRoomMembers.preferredLanguage,
        lastReadAt: chatRoomMembers.lastReadAt,
        joinedAt: chatRoomMembers.joinedAt,
        name: users.name,
        email: users.email,
        avatarSrc: users.avatarSrc,
        nativeLanguage: users.nativeLanguage,
      })
      .from(chatRoomMembers)
      .innerJoin(users, eq(chatRoomMembers.userId, users.id))
      .where(inArray(chatRoomMembers.roomId, roomIds)),
  ]);

  // Latest message per room via DISTINCT ON + unread counts per room.
  const roomIdList = sql.join(roomIds.map((id) => sql.raw(String(id))), sql.raw(', '));
  const [latestResult, unreadResult] = await Promise.all([
    db.execute(
      sql`
        SELECT DISTINCT ON (room_id) id, room_id, sender_id, body, created_at
        FROM chat_messages
        WHERE room_id IN (${roomIdList})
        ORDER BY room_id, created_at DESC, id DESC
      `,
    ),
    db.execute(
      sql`
        SELECT room_id, COUNT(*)::int AS unread
        FROM chat_messages
        WHERE room_id IN (${roomIdList}) AND sender_id <> ${user.id}
        GROUP BY room_id
      `,
    ),
  ]);

  const latestRows = latestResult.rows as Array<Record<string, unknown>>;
  const unreadRows = unreadResult.rows as Array<Record<string, unknown>>;

  const latestByRoom = new Map<number, Record<string, unknown>>();
  for (const row of latestRows) latestByRoom.set(Number(row.room_id), row);

  const unreadByRoom = new Map<number, number>();
  for (const row of unreadRows) unreadByRoom.set(Number(row.room_id), Number(row.unread));

  const membersByRoom = new Map<number, MemberRow[]>();
  for (const m of members as unknown as MemberRow[]) {
    const arr = membersByRoom.get(m.roomId);
    if (arr) arr.push(m);
    else membersByRoom.set(m.roomId, [m]);
  }

  const roomsMap = new Map(rooms.map((r) => [r.id, r]));

  const list = myMemberships
    .map((membership) => {
      const room = roomsMap.get(membership.roomId);
      if (!room) return null;

      const roomMembers = membersByRoom.get(membership.roomId) ?? [];
      const latest = latestByRoom.get(membership.roomId);
      const latestId = latest ? Number(latest.id) : null;
      const createdAt = latest ? String(latest.created_at) : null;
      const latestSenderId = latest ? (latest.sender_id as string | null) : null;

      // Name resolution: explicit room name > other member's name (1:1) > joined names (group)
      let name = room.name;
      if (!name) {
        const others = roomMembers.filter((m) => m.userId !== user.id);
        if (others.length === 1) name = others[0].name ?? 'Unknown';
        else name = roomMembers.map((m) => m.name).filter(Boolean).slice(0, 3).join(', ');
      }

      // Zero out unread when the latest message was already read.
      let unread = unreadByRoom.get(membership.roomId) ?? 0;
      if (latestId !== null && membership.lastReadAt && createdAt) {
        if (new Date(createdAt).getTime() <= new Date(membership.lastReadAt).getTime()) unread = 0;
      }

      return {
        id: room.id,
        name: name ?? 'Chat',
        isGroup: room.isGroup,
        members: roomMembers.map((m) => ({
          id: m.userId,
          name: m.name ?? 'Unknown',
          avatarSrc: m.avatarSrc,
          nativeLanguage: m.nativeLanguage,
        })),
        lastMessage: latest
          ? {
              id: latestId,
              body: String(latest.body ?? ''),
              senderId: latestSenderId,
              createdAt,
            }
          : null,
        unreadCount: unread,
        createdAt: room.createdAt,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => {
      const aTime = a.lastMessage?.createdAt ?? a.createdAt;
      const bTime = b.lastMessage?.createdAt ?? b.createdAt;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });

  return Response.json({ success: true, rooms: list });
}

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const memberIds: string[] = Array.isArray(body?.memberIds)
    ? body.memberIds.filter((m: unknown) => typeof m === 'string')
    : [];
  const name = typeof body?.name === 'string' && body.name.trim() ? body.name.trim() : null;

  const otherIds = memberIds.filter((m) => m !== user.id);
  if (otherIds.length === 0) {
    return Response.json({ error: 'Please select at least one other person' }, { status: 400 });
  }

  // Resolve all unique member ids, caller first.
  const allMemberIds = Array.from(new Set([user.id, ...otherIds]));
  const isGroup = allMemberIds.length > 2;

  // Verify every member id corresponds to a real user.
  const userRows = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.id, allMemberIds));
  const valid = new Set(userRows.map((r) => r.id));
  for (const id of allMemberIds) {
    if (!valid.has(id)) {
      return Response.json({ error: 'One or more selected users do not exist' }, { status: 400 });
    }
  }

  // 1:1 rooms are de-duplicated: reuse an existing non-group room with exactly
  // these two members instead of creating a duplicate.
  if (!isGroup) {
    const existingResult = await db.execute(
      sql`
        SELECT r.id
        FROM chat_rooms r
        JOIN chat_room_members m1 ON m1.room_id = r.id AND m1.user_id = ${user.id}
        JOIN chat_room_members m2 ON m2.room_id = r.id AND m2.user_id = ${otherIds[0]}
        WHERE r.is_group = false
          AND NOT EXISTS (
            SELECT 1 FROM chat_room_members m3
            WHERE m3.room_id = r.id AND m3.user_id NOT IN (${user.id}, ${otherIds[0]})
          )
        LIMIT 1
      `,
    );
    const reused = existingResult.rows[0] as Record<string, unknown> | undefined;
    if (reused) {
      return Response.json({ success: true, roomId: Number(reused.id), reused: true });
    }
  }

  const [created] = await db
    .insert(chatRooms)
    .values({ name, isGroup, createdBy: user.id })
    .returning();

  await db.insert(chatRoomMembers).values(
    allMemberIds.map((id) => ({ roomId: created.id, userId: id })),
  );

  return Response.json({ success: true, roomId: created.id, reused: false }, { status: 201 });
}