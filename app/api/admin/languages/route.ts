import { asc, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db';
import { languages } from '@/src/schema';
import { requireRole, roleErrorResponse } from '@/lib/auth/server';
import { invalidateLanguageCatalog } from '@/lib/language-registry';

export const runtime = 'nodejs';

/**
 * The language catalogue an admin owns.
 *
 * A language is not just a name: without the BCP47 tags and the Azure voice
 * ids nothing can be spoken or transcribed in it, so every one of those is a
 * required field on create. `lib/language.ts` seeds this table and remains the
 * fallback; from then on these rows are the source of truth, resolved through
 * `lib/language-registry.ts`.
 *
 * Every write invalidates the cached catalogue, or the change would not be
 * visible until the TTL lapsed.
 */
export async function GET() {
  try {
    await requireRole('admin');
  } catch (err) {
    return roleErrorResponse(err);
  }

  const rows = await db
    .select()
    .from(languages)
    .orderBy(asc(languages.displayOrder), asc(languages.name));

  // How many rows would break if this language were removed. Shown next to the
  // delete button so the decision is made with the number in view.
  const [usage] = await db
    .select({
      byUsersTarget: sql<string>`(
        select coalesce(json_object_agg(preferred_target_language, n), '{}')
        from (select preferred_target_language, count(*)::int n from users group by 1) t
      )`,
      byUsersNative: sql<string>`(
        select coalesce(json_object_agg(native_language, n), '{}')
        from (select native_language, count(*)::int n from users group by 1) t
      )`,
      bySessions: sql<string>`(
        select coalesce(json_object_agg(target_language, n), '{}')
        from (select target_language, count(*)::int n from sessions group by 1) t
      )`,
    })
    .from(languages)
    .limit(1);

  const parse = (v: unknown): Record<string, number> =>
    typeof v === 'string' ? JSON.parse(v) : ((v as Record<string, number>) ?? {});

  const usersTarget = parse(usage?.byUsersTarget);
  const usersNative = parse(usage?.byUsersNative);
  const sessions = parse(usage?.bySessions);

  return Response.json({
    success: true,
    languages: rows.map((row) => ({
      ...row,
      inUse:
        (usersTarget[row.code] ?? 0) + (usersNative[row.code] ?? 0) + (sessions[row.code] ?? 0),
    })),
  });
}

/** Every field needed to actually speak a language, and what it must look like. */
function readLanguageBody(body: Record<string, unknown>) {
  const str = (key: string, max: number) => {
    const v = body[key];
    return typeof v === 'string' ? v.trim().slice(0, max) : '';
  };

  return {
    code: str('code', 10).toLowerCase(),
    name: str('name', 60),
    nativeName: str('nativeName', 60),
    flag: str('flag', 8) || '🌐',
    sttBcp47: str('sttBcp47', 20),
    ttsBcp47: str('ttsBcp47', 20),
    azureVoiceFemale: str('azureVoiceFemale', 80),
    azureVoiceMale: str('azureVoiceMale', 80),
    hasPhonetic: body.hasPhonetic === true,
    ttsSupported: body.ttsSupported !== false,
    greetingGesture:
      body.greetingGesture === 'bow' || body.greetingGesture === 'wave'
        ? (body.greetingGesture as string)
        : null,
    isTargetEnabled: body.isTargetEnabled !== false,
    isNativeEnabled: body.isNativeEnabled !== false,
    displayOrder: Number.isFinite(Number(body.displayOrder)) ? Number(body.displayOrder) : 0,
  };
}

export async function POST(req: Request) {
  try {
    await requireRole('admin');
  } catch (err) {
    return roleErrorResponse(err);
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return Response.json({ error: 'Invalid body' }, { status: 400 });
  }

  const values = readLanguageBody(body as Record<string, unknown>);

  // Required because a row missing any of them cannot drive a session: the
  // prompt names the language, the recognizer needs the STT tag, and TTS needs
  // both the tag and a voice id.
  const missing = (['code', 'name', 'nativeName', 'sttBcp47', 'ttsBcp47', 'azureVoiceFemale', 'azureVoiceMale'] as const)
    .filter((k) => !values[k]);
  if (missing.length > 0) {
    return Response.json({ error: `Missing: ${missing.join(', ')}` }, { status: 400 });
  }
  if (!/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i.test(values.code)) {
    return Response.json(
      { error: 'Code must look like a language tag — "sw", "pt-br".' },
      { status: 400 },
    );
  }

  const [existing] = await db
    .select({ code: languages.code })
    .from(languages)
    .where(eq(languages.code, values.code))
    .limit(1);
  if (existing) {
    return Response.json({ error: `"${values.code}" already exists.` }, { status: 409 });
  }

  await db.insert(languages).values({ ...values, isBuiltIn: false });
  await invalidateLanguageCatalog();

  return Response.json({ success: true, code: values.code }, { status: 201 });
}

export async function PATCH(req: Request) {
  try {
    await requireRole('admin');
  } catch (err) {
    return roleErrorResponse(err);
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || typeof body.code !== 'string') {
    return Response.json({ error: 'code is required' }, { status: 400 });
  }

  const code = body.code.trim().toLowerCase();
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  const full = readLanguageBody(body as Record<string, unknown>);

  // Partial: only what was sent. The enable flags are the common case — an
  // admin toggling a language on or off should not have to resend its voices.
  for (const key of [
    'name', 'nativeName', 'flag', 'sttBcp47', 'ttsBcp47',
    'azureVoiceFemale', 'azureVoiceMale', 'displayOrder',
  ] as const) {
    if (body[key] !== undefined && full[key] !== '') updates[key] = full[key];
  }
  for (const key of ['hasPhonetic', 'ttsSupported', 'isTargetEnabled', 'isNativeEnabled'] as const) {
    if (body[key] !== undefined) updates[key] = full[key];
  }
  if (body.greetingGesture !== undefined) updates.greetingGesture = full.greetingGesture;

  if (Object.keys(updates).length === 1) {
    return Response.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const [updated] = await db
    .update(languages)
    .set(updates)
    .where(eq(languages.code, code))
    .returning({ code: languages.code });
  if (!updated) return Response.json({ error: 'Language not found' }, { status: 404 });

  await invalidateLanguageCatalog();
  return Response.json({ success: true });
}

/**
 * Removes a language.
 *
 * Refused for a built-in row — the constants would reintroduce it on the next
 * seed, so "deleting" one would appear to work and silently undo itself.
 * Disable it instead, which is what the enable flags exist for.
 *
 * Also refused while anything still references the code. Those columns are
 * plain `varchar`, not foreign keys, so Postgres would not stop this: deleting
 * a language in use leaves learners and sessions pointing at a code that no
 * longer resolves, and `getTargetLangConfig` would silently fall back to the
 * first language in the catalogue — every affected learner's target language
 * would quietly become something else.
 */
export async function DELETE(req: Request) {
  try {
    await requireRole('admin');
  } catch (err) {
    return roleErrorResponse(err);
  }

  const body = await req.json().catch(() => null);
  const code = body && typeof body.code === 'string' ? body.code.trim().toLowerCase() : '';
  if (!code) return Response.json({ error: 'code is required' }, { status: 400 });

  const [row] = await db.select().from(languages).where(eq(languages.code, code)).limit(1);
  if (!row) return Response.json({ error: 'Language not found' }, { status: 404 });

  if (row.isBuiltIn) {
    return Response.json(
      {
        error:
          'Built-in languages cannot be deleted — seeding would restore them. Disable it instead.',
      },
      { status: 409 },
    );
  }

  const [counts] = await db
    .select({
      learners: sql<number>`(select count(*)::int from users where preferred_target_language = ${code} or native_language = ${code})`,
      sessions: sql<number>`(select count(*)::int from sessions where target_language = ${code} or native_language = ${code})`,
      enrolments: sql<number>`(select count(*)::int from student_progress where target_language = ${code})`,
      classes: sql<number>`(select count(*)::int from class_sessions where target_language = ${code} or instruction_language = ${code})`,
    })
    .from(languages)
    .limit(1);

  const total =
    Number(counts?.learners ?? 0) +
    Number(counts?.sessions ?? 0) +
    Number(counts?.enrolments ?? 0) +
    Number(counts?.classes ?? 0);

  if (total > 0) {
    return Response.json(
      {
        error:
          `"${code}" is still in use by ${counts?.learners ?? 0} account(s), ` +
          `${counts?.sessions ?? 0} session(s), ${counts?.enrolments ?? 0} enrolment(s) and ` +
          `${counts?.classes ?? 0} class(es). Disable it instead of deleting it.`,
      },
      { status: 409 },
    );
  }

  await db.delete(languages).where(eq(languages.code, code));
  await invalidateLanguageCatalog();

  return Response.json({ success: true });
}
