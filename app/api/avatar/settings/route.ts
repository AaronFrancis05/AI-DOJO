import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/avatar/db';
import { userSettings, appSettings } from '@/lib/avatar/schema';
import { eq, and } from 'drizzle-orm';
import { getAuthUser } from '@/lib/auth/server';
import { getSettingsScope, getSettingsGroup, getAppId } from '@/lib/avatar/setttingsScope';

// The widget bundle (CharacterBrain.js / AvatarController.js) speaks
// snake_case, ported from the original FastAPI reference. Drizzle/JS side
// is camelCase. Translate at this boundary so neither side has to change.
function toSnakeCaseSettings(row: {
  uiLanguage?: string | null;
  responseLanguage?: string | null;
  lastAvatar?: string | null;
  personaOverrides?: string | null;
}) {
  return {
    ui_language: row.uiLanguage ?? 'en',
    response_language: row.responseLanguage ?? 'ja',
    last_avatar: row.lastAvatar ?? null,
    persona_overrides: row.personaOverrides ?? null,
  };
}

export async function GET(req: NextRequest) {
  const scope = getSettingsScope(req.headers);

  if (scope === 'app') {
    const appId = getAppId(req.headers);
    if (!appId) {
      return NextResponse.json({ error: 'Missing X-App-Id for app-scoped settings' }, { status: 400 });
    }
    const settingsGroup = getSettingsGroup(req.headers);
    const [row] = await db
      .select()
      .from(appSettings)
      .where(and(eq(appSettings.appId, appId), eq(appSettings.settingsGroup, settingsGroup)))
      .limit(1);
    return NextResponse.json(toSnakeCaseSettings(row ?? {}));
  }

  // scope === 'user' — original per-user behavior, untouched
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [row] = await db.select().from(userSettings).where(eq(userSettings.userId, user.id)).limit(1);
  return NextResponse.json(toSnakeCaseSettings(row ?? {}));
}

export async function POST(req: NextRequest) {
  const scope = getSettingsScope(req.headers);
  const body = await req.json();

  // Accept snake_case from the widget (its actual wire format), falling
  // back to camelCase in case anything ever sends that instead.
  const uiLanguage = body.ui_language ?? body.uiLanguage;
  const responseLanguage = body.response_language ?? body.responseLanguage;
  const lastAvatar = body.last_avatar ?? body.lastAvatar;
  const personaOverrides = body.persona_overrides ?? body.personaOverrides;

  if (scope === 'app') {
    const appId = getAppId(req.headers);
    if (!appId) {
      return NextResponse.json({ error: 'Missing X-App-Id for app-scoped settings' }, { status: 400 });
    }
    const settingsGroup = getSettingsGroup(req.headers);
    const values = {
      appId,
      settingsGroup,
      uiLanguage,
      responseLanguage,
      lastAvatar,
      personaOverrides,
    };
    await db
      .insert(appSettings)
      .values(values)
      .onConflictDoUpdate({ target: [appSettings.appId, appSettings.settingsGroup], set: values });
    return NextResponse.json(toSnakeCaseSettings(values));
  }

  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const values = {
    userId: user.id,
    uiLanguage,
    responseLanguage,
    lastAvatar,
    personaOverrides,
  };
  await db.insert(userSettings).values(values).onConflictDoUpdate({ target: userSettings.userId, set: values });
  return NextResponse.json(toSnakeCaseSettings(values));
}