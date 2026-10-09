import { createHash, timingSafeEqual } from 'node:crypto';

export function verifyExportApiKey(req: Request): boolean {
  const authHeader = req.headers.get('authorization') ?? '';
  const expectedKey = process.env.AVATAR_EXPORT_API_KEY;

  if (!expectedKey) {
    console.error('AVATAR_EXPORT_API_KEY is not set in environment variables');
    return false;
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;

  // Constant-time: `===` returns at the first differing character, which
  // leaks the key one character at a time to a caller who measures response
  // times. Hashing first gives equal-length buffers, which timingSafeEqual needs.
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(match[1]), digest(expectedKey));
}
