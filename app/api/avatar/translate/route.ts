/**
 * app/api/avatar/translate/route.ts
 *
 * Port of backend.py's POST /translate.
 *
 * The Python version reads `text`/`target` as multipart Form fields
 * (FastAPI's `Form(...)`), matching whatever the frontend was already
 * sending. Next.js route handlers don't get that parsed for free, so this
 * accepts EITHER a JSON body ({ text, target }) OR a form-encoded body
 * (multipart/form-data or application/x-www-form-urlencoded), based on
 * Content-Type — so an existing frontend that still posts a FormData
 * object doesn't need to change, but a fetch()-with-JSON caller works too.
 */
import { NextRequest, NextResponse } from "next/server";
import { translateToJapanese, translateToEnglish } from "@/lib/avatar/translation";

interface TranslateBody {
  text: string;
  target: string;
}

async function parseBody(request: NextRequest): Promise<TranslateBody> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = await request.json();
    return {
      text: String(body.text ?? ""),
      target: String(body.target ?? "ja"),
    };
  }

  // multipart/form-data or application/x-www-form-urlencoded
  const form = await request.formData();
  return {
    text: String(form.get("text") ?? ""),
    target: String(form.get("target") ?? "ja"),
  };
}

export async function POST(request: NextRequest) {
  let body: TranslateBody;
  try {
    body = await parseBody(request);
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.text) {
    return NextResponse.json({ error: "Missing 'text'" }, { status: 400 });
  }

  if (body.target === "en") {
    return NextResponse.json({
      text: await translateToEnglish(body.text),
      romanization: "",
    });
  }

  const result = await translateToJapanese(body.text);
  return NextResponse.json({
    text: result.japanese,
    romanization: result.romanization,
  });
}