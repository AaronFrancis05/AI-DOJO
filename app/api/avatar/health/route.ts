
import { NextResponse } from "next/server";
import { aiAvailable, GROQ_MODEL } from "@/lib/avatar/ai";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    ai_enabled: aiAvailable(),
    provider: "groq",
    model: GROQ_MODEL,
    memory_mode: "temporary_memory",
  });
}