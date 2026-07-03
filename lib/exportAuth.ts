export function verifyExportApiKey(req: Request): boolean {
  const authHeader = req.headers.get('authorization') ?? '';
  const expectedKey = process.env.AVATAR_EXPORT_API_KEY;

  if (!expectedKey) {
    console.error('AVATAR_EXPORT_API_KEY is not set in environment variables');
    return false;
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;

  return match[1] === expectedKey;
}
