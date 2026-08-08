import { db } from '../../../../../src/db';
import {
  chatRooms,
  chatRoomMembers,
  chatMessages,
  chatMessageTranslations,
  users,
} from '../../../../../src/schema';
import { getAuthUser } from '../../../../../lib/auth/server';
import { translateText, detectLanguageSafe } from '../../../../../lib/ugajapa';
import { eq, and, gt, inArray } from 'drizzle-orm';

export async function GET(
  req: Request,
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

  // Resolve my target language for translation.
  const [profile] = await db
    .select({ nativeLanguage: users.nativeLanguage })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  const myLanguage = membership.preferredLanguage ?? profile?.nativeLanguage ?? 'en';

  const url = new URL(req.url);
  const afterRaw = url.searchParams.get('after');
  const afterId = afterRaw ? Number(afterRaw) : null;

  const conditions = [eq(chatMessages.roomId, id)];
  if (afterId && !isNaN(afterId)) conditions.push(gt(chatMessages.id, afterId));

  const rows = await db
    .select({
      messageId: chatMessages.id,
      senderId: chatMessages.senderId,
      body: chatMessages.body,
      sourceLanguage: chatMessages.sourceLanguage,
      createdAt: chatMessages.createdAt,
      senderName: users.name,
      senderAvatar: users.avatarSrc,
    })
    .from(chatMessages)
    .leftJoin(users, eq(chatMessages.senderId, users.id))
    .where(and(...conditions))
    .orderBy(chatMessages.id)
    .limit(100);

  const messageIds = rows.map((r) => r.messageId);
  const translations =
    messageIds.length > 0
      ? await db
          .select()
          .from(chatMessageTranslations)
          .where(
            and(
              inArray(chatMessageTranslations.messageId, messageIds),
              eq(chatMessageTranslations.targetLanguage, myLanguage),
            ),
          )
      : [];

  const translationsByMsg = new Map<number, (typeof translations)[number]>();
  for (const t of translations) translationsByMsg.set(t.messageId, t);

  const messages = await Promise.all(
    rows.map(async (row) => {
      const cached = translationsByMsg.get(row.messageId);

      if (!cached) {
        // Lazy translate on read (covers messages sent before the member joined,
        // or sent while UgaJapa was unreachable). onConflictDoNothing guards the
        // race with the POST-time bulk translate.
        const result = await translateText(row.body, myLanguage, row.sourceLanguage);
        if (result.provider === 'ugajapa') {
          try {
            await db
              .insert(chatMessageTranslations)
              .values({
                messageId: row.messageId,
                targetLanguage: myLanguage,
                translatedText: result.translatedText,
                qualityScore: result.qualityScore != null ? String(result.qualityScore) : null,
                provider: result.provider,
              })
              .onConflictDoNothing();
          } catch (err) {
            console.warn('[chat-messages] failed to cache lazy translation', String(err));
          }
        }
        return {
          id: row.messageId,
          senderId: row.senderId,
          senderName: row.senderName ?? 'Unknown',
          senderAvatarSrc: row.senderAvatar,
          body: row.body,
          sourceLanguage: row.sourceLanguage,
          translatedBody: result.translatedText,
          translationProvider: result.provider,
          isMine: row.senderId === user.id,
          createdAt: row.createdAt,
        };
      }

      const quality =
        cached.qualityScore != null ? Number(cached.qualityScore) : null;

      // The sender sees their own text verbatim (translation is for the other side).
      const isMine = row.senderId === user.id;
      const translatedBody = isMine ? row.body : (cached.translatedText ?? row.body);

      return {
        id: row.messageId,
        senderId: row.senderId,
        senderName: row.senderName ?? 'Unknown',
        senderAvatarSrc: row.senderAvatar,
        body: row.body,
        sourceLanguage: row.sourceLanguage,
        translatedBody,
        translationProvider: cached.provider === 'ugajapa'
          ? (translatedBody === row.body ? 'none' : 'ugajapa')
          : 'none',
        qualityScore: quality,
        isMine,
        createdAt: row.createdAt,
      };
    }),
  );

  return Response.json({ success: true, messages, myLanguage });
}

export async function POST(
  req: Request,
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

  const body = await req.json().catch(() => null);
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  if (!text || text.length > 4000) {
    return Response.json({ error: 'Message must be 1-4000 characters' }, { status: 400 });
  }

  const [membership] = await db
    .select()
    .from(chatRoomMembers)
    .where(and(eq(chatRoomMembers.roomId, id), eq(chatRoomMembers.userId, user.id)));
  if (!membership) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Resolve source language: caller-declared, else auto-detect (fails open to null).
  const declaredSource =
    typeof body?.sourceLanguage === 'string' && body.sourceLanguage.trim()
      ? body.sourceLanguage.trim()
      : null;
  const detected = declaredSource ?? (await detectLanguageSafe(text))?.language ?? null;
  const sourceLanguage = declaredSource ?? detected;

  const [created] = await db
    .insert(chatMessages)
    .values({ roomId: id, senderId: user.id, body: text, sourceLanguage })
    .returning();

  // Eagerly translate into every OTHER member's language and cache it, so the
  // recipients' next poll returns pre-translated text. Dedupe by language so a
  // group room with several members reading the same language only pays once.
  try {
    const members = await db
      .select({
        preferredLanguage: chatRoomMembers.preferredLanguage,
        nativeLanguage: users.nativeLanguage,
      })
      .from(chatRoomMembers)
      .innerJoin(users, eq(chatRoomMembers.userId, users.id))
      .where(eq(chatRoomMembers.roomId, id));

    const targetLangs = Array.from(
      new Set(
        members
          .filter((m) => m.nativeLanguage !== sourceLanguage)
          .map((m) => m.preferredLanguage ?? m.nativeLanguage ?? 'en')
          .filter(Boolean),
      ),
    ).filter((lang) => lang !== sourceLanguage);

    await Promise.all(
      targetLangs.map(async (lang) => {
        const result = await translateText(text, lang, sourceLanguage);
        if (result.provider === 'ugajapa') {
          await db
            .insert(chatMessageTranslations)
            .values({
              messageId: created.id,
              targetLanguage: lang,
              translatedText: result.translatedText,
              qualityScore: result.qualityScore != null ? String(result.qualityScore) : null,
              provider: result.provider,
            })
            .onConflictDoNothing();
        }
      }),
    );
  } catch (err) {
    console.warn('[chat] bulk translate failed:', err instanceof Error ? err.message : String(err));
  }

  return Response.json({ success: true, message: created }, { status: 201 });
}