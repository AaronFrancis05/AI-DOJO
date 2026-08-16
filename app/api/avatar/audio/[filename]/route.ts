import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ filename: string }> }) {
  const { filename } = await params;
  if (!filename || filename.includes("..") || filename.includes("/")) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  const filePath = path.join(process.cwd(), "public", "audio", path.basename(filename));

  try {
    const audio = await readFile(filePath);
    return new Response(audio, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(audio.length),
      },
    });
  } catch (error) {
    return NextResponse.json({ error: "Audio file not found" }, { status: 404 });
  }
}
