
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/avatar/db";
import { getUserId, MissingUserIdError } from "@/lib/avatar/auth";

export async function POST(request: NextRequest) {
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

  const conditions = [eq(schema.chatMessages.userId, userId)];
  if (characterName !== null) {
    conditions.push(eq(schema.chatMessages.characterName, characterName));
  }

  await db.delete(schema.chatMessages).where(and(...conditions));

  return NextResponse.json({ status: "cleared", mode: "postgres" });
}