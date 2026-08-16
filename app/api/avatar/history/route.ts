
import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/avatar/db";
import { getUserId, MissingUserIdError } from "@/lib/avatar/auth";

export async function GET(request: NextRequest) {
  let userId: string;
  try {
    userId = getUserId(request.headers, request.cookies);
  } catch (e) {
    if (e instanceof MissingUserIdError) {
      return NextResponse.json({ detail: e.message }, { status: 400 });
    }
    throw e;
  }

  const characterName = request.nextUrl.searchParams.get("character_name");

  try {
    const conditions = [eq(schema.chatMessages.userId, userId)];
    if (characterName !== null) {
      conditions.push(eq(schema.chatMessages.characterName, characterName));
    }

    const rows = await db
      .select()
      .from(schema.chatMessages)
      .where(and(...conditions))
      .orderBy(asc(schema.chatMessages.id));

    const history = rows.map((h) => ({
      role: h.role,
      content: h.content,
      text: h.text,
      text_en: h.textEn,
      text_ja: h.textJa,
      character_name: h.characterName,
      time: h.time?.toISOString?.() ?? null,
    }));

    return NextResponse.json({ history });
  } catch (error) {
    console.error("[avatar/history] failed to load history", error);
    // Real failure — say so. Do NOT return { history: [] } here; that
    // made a failed fetch indistinguishable from a genuinely empty history
    // (see file header).
    return NextResponse.json(
      { error: "Failed to load history" },
      { status: 500 }
    );
  }
}