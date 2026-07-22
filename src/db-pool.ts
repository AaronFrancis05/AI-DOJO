import 'dotenv/config';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool } from '@neondatabase/serverless';
import { sql } from 'drizzle-orm';
import * as schema from './schema';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not defined in the environment variables');
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const dbPool = drizzle(pool, { schema });

export async function withSessionLock<T>(
  sessionId: number,
  fn: (tx: any) => Promise<T>,
): Promise<T> {
  return await dbPool.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${sessionId})`);
    return await fn(tx);
  });
}
