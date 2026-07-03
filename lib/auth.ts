import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

function getJwtSecret(): string {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is not set on the server');
  }
  return process.env.JWT_SECRET;
}
const JWT_EXPIRY = '7d';
const COOKIE_NAME = 'ai_dojo_token';

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function signJwt(payload: { userId: number; email: string }) {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: JWT_EXPIRY });
}

export function verifyJwt(token: string): { userId: number; email: string } | null {
  try {
    return jwt.verify(token, getJwtSecret()) as { userId: number; email: string };
  } catch {
    return null;
  }
}

export function getAuthUser(req: Request): { userId: number; email: string } | null {
  const cookieHeader = req.headers.get('cookie') ?? '';
  const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  if (!match) return null;
  return verifyJwt(match[1]);
}

export function setAuthCookie(userId: number, email: string): string {
  const token = signJwt({ userId, email });
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 7}`;
}

export function clearAuthCookie(): string {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export const AUTH_COOKIE_NAME = COOKIE_NAME;
