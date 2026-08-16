

import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/avatar/db";
import { chatMessages, userSettings } from "@/lib/avatar/schema";
import { getUserId, MissingUserIdError } from "@/lib/avatar/auth";
import { buildCharacterSystem, think } from "@/lib/avatar/behavior";
import { translateToEnglish, translateToJapanese, isJapanese } from "@/lib/avatar/translation";
import {
  resolveVoice,
  nextAudioName,
  audioOutputPath,
  safeTts,
} from "@/lib/avatar/tts";
import type { LlmMessage } from "@/lib/avatar/ai";

interface AskRequestBody {
  text: string;
  avatar_persona?: string | null;
  character_name?: string | null;
  voice_en?: string | null;
  voice_ja?: string | null;
  speak_language?: string | null;
  timezone?: string | null;
}

export async function POST(request: NextRequest) {
  // ── User identity ──────────────────────────────────────────────────
  let userId: string;
  try {
    userId = getUserId(request.headers, request.cookies);
  } catch (e) {
    if (e instanceof MissingUserIdError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }

  // ── Parse + validate body ─────────────────────────────────────────
  let body: AskRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const userText = (body.text ?? "").trim();
  if (!userText) {
    return NextResponse.json({ error: "Empty input" }, { status: 400 });
  }

  // ── JA->EN normalize the incoming message before it hits the LLM ───
  const userForAi = isJapanese(userText)
    ? await translateToEnglish(userText)
    : userText;

  const systemPrompt = buildCharacterSystem(
    userForAi,
    body.character_name ?? null,
    body.avatar_persona ?? null
  );

  // ── Resolve effective response language: stored setting is the ─────
  // source of truth unless this request explicitly overrides it with
  // something other than the default "en" — same precedence as backend.py.
  const settingsRows = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  const settingsRow = settingsRows[0];

  const storedResponseLanguage = settingsRow?.responseLanguage ?? null;
  let effectiveLanguage = body.speak_language ?? undefined;
  if (storedResponseLanguage && (!effectiveLanguage || effectiveLanguage === "en")) {
    effectiveLanguage = storedResponseLanguage;
  }
  const primary: "en" | "ja" = effectiveLanguage === "ja" ? "ja" : "en";

  // ── Chat history: scoped by user AND active character ──────────────
  const activeCharacterName = body.character_name ?? null;
  const ownTurns = await db
    .select()
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.userId, userId),
        activeCharacterName === null
          ? isNull(chatMessages.characterName)
          : eq(chatMessages.characterName, activeCharacterName)
      )
    )
    .orderBy(asc(chatMessages.id));

  const history: LlmMessage[] = ownTurns.slice(-20).map((h) => ({
    role: (h.role === "assistant" ? "assistant" : "user") as "assistant" | "user",
    content: h.content ?? "",
  }));

  // ── Think ────────────────────────────────────────────────────────
  const behavior = await think(userForAi, systemPrompt, history, activeCharacterName);
  const replyEn = behavior.reply || "...";

  // ── EN->JA translate the reply ──────────────────────────────────
  const translation = await translateToJapanese(replyEn);
  const replyJa = translation.japanese;
  const romanization = translation.romanization;

  // ── TTS (both languages, same as Python) ────────────────────────
  const enVoice = resolveVoice(body.voice_en, false);
  const jaVoice = resolveVoice(body.voice_ja, true);

  const enName = nextAudioName("temp_en");
  const jaName = nextAudioName("temp_ja");
  const enPath = audioOutputPath(enName);
  const jaPath = audioOutputPath(jaName);

  const [enResult, jaResult] = await Promise.all([
    safeTts(replyEn, enVoice, enPath),
    safeTts(replyJa, jaVoice, jaPath),
  ]);

  // NOTE: lib/tts.ts writes to public/audio/, served by Next.js at
  // /audio/<file>, NOT /static/<file> like the Python original — using the
  // correct prefix here, matches how AUDIO_DIR is actually defined in tts.ts.
  const audioUrlEn = enResult.generated ? `/audio/${enName}` : "";
  const audioUrlJa = jaResult.generated ? `/audio/${jaName}` : "";
  const finalAudioUrl = primary === "ja" ? audioUrlJa : audioUrlEn;

  // ── Persist turns (skip if this was a fallback/offline reply) ──────
  if (!behavior._fallback) {
    await db.insert(chatMessages).values([
      {
        userId,
        characterName: activeCharacterName,
        role: "user",
        content: userForAi,
        text: userText,
      },
      {
        userId,
        characterName: activeCharacterName,
        role: "assistant",
        content: replyEn,
        textEn: replyEn,
        textJa: replyJa,
      },
    ]);
  }

  return NextResponse.json({
    reply: replyEn,
    translated_reply: replyJa,
    romanization,
    expression: behavior.expression || "neutral",
    animation: behavior.animation || "explain",
    audio_url_en: audioUrlEn,
    audio_url_ja: audioUrlJa,
    audio_url: finalAudioUrl,
    visemes_en: enResult.visemes,
    visemes_ja: jaResult.visemes,
    visemes: primary === "ja" ? jaResult.visemes : enResult.visemes,
    primary,
    voice: primary === "ja" ? jaVoice : enVoice,
    mode: "temporary",
  });
}