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