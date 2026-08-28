import { db } from '../../../../../src/db';
import {
  chatRooms,
  chatRoomMembers,
  chatMessages,
  chatMessageTranslations,
  users,
} from '../../../../../src/schema';
import { getAuthUser } from '../../../../../lib/auth/server';
import { translateText, detectLanguageSafe, transcribeAudio } from '../../../../../lib/ugajapa';
import { publish } from '../../../../../lib/realtime/bus';
import { topics } from '../../../../../lib/realtime/topics';
import { eq, and, gt, inArray } from 'drizzle-orm';

const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
const ALLOWED_AUDIO_TYPES = new Set(['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav']);

function normalizeAudioType(raw: string): string | null {
  const base = (raw.split(';')[0] ?? '').trim().toLowerCase();
  return ALLOWED_AUDIO_TYPES.has(base) ? base : null;
}

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
      audioUrl: chatMessages.audioUrl,
      audioMimeType: chatMessages.audioMimeType,
      audioDurationMs: chatMessages.audioDurationMs,
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
        // race with the POST-time bulk translate. Voice-only placeholders and
        // the sender's own messages are never meaningful to translate.
        const isMineLazy = row.senderId === user.id;
        const placeholder = row.body === '[Voice message]';
        const lazyResult = placeholder || isMineLazy
          ? { translatedText: row.body, provider: 'none' as const }
          : await translateText(row.body, myLanguage, row.sourceLanguage);

        if (lazyResult.provider === 'ugajapa') {
          try {
            await db
              .insert(chatMessageTranslations)
              .values({
                messageId: row.messageId,
                targetLanguage: myLanguage,
                translatedText: lazyResult.translatedText,
                qualityScore: lazyResult.qualityScore != null ? String(lazyResult.qualityScore) : null,
                provider: lazyResult.provider,
              })
              .onConflictDoNothing();
          } catch (err) {
            console.warn('[chat-messages] failed to cache lazy translation', String(err));
          }
        }
        // The sender reads their own transcript verbatim; others get the translation.
        return {
          id: row.messageId,
          senderId: row.senderId,
          senderName: row.senderName ?? 'Unknown',
          senderAvatarSrc: row.senderAvatar,
          body: row.body,
          sourceLanguage: row.sourceLanguage,
          translatedBody: isMineLazy ? row.body : lazyResult.translatedText,
          translationProvider: lazyResult.provider === 'ugajapa' && !isMineLazy && lazyResult.translatedText !== row.body
            ? 'ugajapa'
            : 'none',
          audioUrl: row.audioUrl,
          audioMimeType: row.audioMimeType,
          audioDurationMs: row.audioDurationMs,
          isMine: isMineLazy,
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
        audioUrl: row.audioUrl,
        audioMimeType: row.audioMimeType,
        audioDurationMs: row.audioDurationMs,
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

  const contentType = req.headers.get('content-type') ?? '';
  const isForm = contentType.includes('multipart/form-data');

  // Parse the request: text messages come as JSON, voice messages as multipart
  // (audio file + durationMs).
  let text = '';
  let sourceLanguage: string | null = null;
  let audioUrl: string | null = null;
  let audioMimeType: string | null = null;
  let audioDurationMs: number | null = null;

  if (isForm) {
    const form = await req.formData().catch(() => null);
    if (!form) {
      return Response.json({ error: 'Invalid request' }, { status: 400 });
    }
    const textField = form.get('text');
    if (textField) text = String(textField).trim();
    const langField = form.get('sourceLanguage');
    if (langField) {
      const v = String(langField).trim();
      if (v) sourceLanguage = v;
    }
    const durField = form.get('durationMs');
    if (durField) {
      const d = Number(durField);
      if (Number.isFinite(d)) audioDurationMs = Math.max(0, Math.round(d));
    }
    const file = form.get('audio');
    if (file instanceof File) {
      if (file.size > MAX_AUDIO_BYTES) {
        return Response.json({ error: 'Voice message is too large' }, { status: 413 });
      }
      const safeType = normalizeAudioType(file.type || 'audio/webm');
      if (!safeType) {
        return Response.json({ error: 'Unsupported audio format' }, { status: 415 });
      }
      audioMimeType = safeType;
      const bytes = new Uint8Array(await file.arrayBuffer());
      const transcript = await transcribeAudio(bytes, safeType);

      if (transcript.provider === 'ugajapa' && transcript.text) {
        text = transcript.text;
        sourceLanguage = transcript.detectedLanguage ?? sourceLanguage ?? null;
      }

      // Persist the clip as a data: URL (mirrors how TTS clips are stored —
      // the project has no object storage; base64 text keeps playback simple).
      const base64 = Buffer.from(bytes).toString('base64');
      audioUrl = `data:${safeType};base64,${base64}`;

      // Voice-only messages are still allowed when transcription fails, so the
      // sender can always record and the clip is never a blocker.
      if (!text) text = '[Voice message]';
    }
  } else {
    const body = await req.json().catch(() => null);
    if (body) {
      if (typeof body.text === 'string') text = body.text.trim();
      if (typeof body.sourceLanguage === 'string' && body.sourceLanguage.trim()) {
        sourceLanguage = body.sourceLanguage.trim();
      }
    }
  }

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
  const detected = sourceLanguage ?? (await detectLanguageSafe(text))?.language ?? null;
  const finalSourceLanguage = sourceLanguage ?? detected;

  const [created] = await db
    .insert(chatMessages)
    .values({
      roomId: id,
      senderId: user.id,
      body: text,
      sourceLanguage: finalSourceLanguage,
      audioUrl,
      audioMimeType,
      audioDurationMs,
    })
    .returning();

  // Eagerly translate into every OTHER member's language and cache it, so the
  // recipients' next poll returns pre-translated text. Dedupe by language so a
  // group room with several members reading the same language only pays once.
  // Voice-only placeholders (transcription failed) are not translated.
  if (text !== '[Voice message]') {
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
            .map((m) => m.preferredLanguage ?? m.nativeLanguage ?? 'en')
            .filter(Boolean),
        ),
      ).filter((lang) => lang !== finalSourceLanguage);

      await Promise.all(
        targetLangs.map(async (lang) => {
          const result = await translateText(text, lang, finalSourceLanguage);
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
  }

  // Announced only after the translations are cached, so the recipients'
  // catch-up fetch returns translated text on its first try rather than
  // showing the original and correcting itself a moment later.
  //
  // The event carries the message id, never the body: every member reads the
  // message in their own language, so there is no single text to broadcast —
  // see lib/realtime/topics.ts.
  await publish(topics.chatRoom(id), {
    type: 'chat.message',
    roomId: id,
    messageId: created.id,
    senderId: user.id,
  });

  return Response.json({ success: true, message: created }, { status: 201 });
}