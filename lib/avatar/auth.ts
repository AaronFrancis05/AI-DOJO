
export class MissingUserIdError extends Error {
  constructor() {
    super("Missing X-User-Id header");
    this.name = "MissingUserIdError";
  }
}

function getCookieValue(headers: Headers, name: string): string | undefined {
  const fromHeaders = headers.get(name)?.trim();
  if (fromHeaders) return fromHeaders;

  const cookieHeader = headers.get("cookie") ?? "";
  const matched = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));

  if (!matched) return undefined;

  const [, rawValue] = matched.split(/=(.*)/);
  return rawValue ? decodeURIComponent(rawValue) : undefined;
}

export function getUserId(
  headers: Headers,
  cookies?: { get(name: string): { value?: string } | undefined } | null,
): string {
  const rawUserId = headers.get("x-user-id")?.trim();
  const cookieUserId = getCookieValue(headers, "x-user-id") || cookies?.get("x-user-id")?.value?.trim();
  const userId = rawUserId || cookieUserId;
  if (!userId) {
    throw new MissingUserIdError();
  }

  const rawAppId = headers.get("x-app-id")?.trim();
  const cookieAppId = getCookieValue(headers, "x-app-id") || cookies?.get("x-app-id")?.value?.trim();
  const appId = rawAppId || cookieAppId || "default";

  return `${appId}::${userId}`;
}
export function getSituationId(headers: Headers): string {
  return headers.get("x-settings-group")?.trim() || "";
}
export function getSettingsScope(headers: Headers): 'user' | 'app' {
  const raw = (headers.get('x-settings-scope') || '').trim().toLowerCase();
  return raw === 'app' ? 'app' : 'user';
}

export function getSettingsGroup(headers: Headers): string {
  return (headers.get('x-settings-group') || '').trim();
}

export function getAppId(headers: Headers): string {
  return (headers.get('x-app-id') || '').trim();
}