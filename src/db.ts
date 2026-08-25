import 'dotenv/config';
import { drizzle } from 'drizzle-orm/neon-http';
import { neon, neonConfig } from '@neondatabase/serverless';
import * as schema from './schema';

if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not defined in the environment variables');
}

/**
 * Undici error codes that mean the request never reached Neon — the TCP/TLS
 * connection was never established, so no query can have executed. Only these
 * are retried; anything that failed mid-flight (or returned an HTTP error) is
 * surfaced to the caller so a non-idempotent write is never replayed.
 */
const CONNECT_ERROR_CODES = new Set([
    'UND_ERR_CONNECT_TIMEOUT',
    'ECONNREFUSED',
    'ENOTFOUND',
    'EAI_AGAIN',
]);

const MAX_CONNECT_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 150;

function isRetryableConnectError(err: unknown): boolean {
    const cause = (err as { cause?: { code?: string; name?: string } } | undefined)?.cause;
    if (!cause) return false;
    if (cause.name === 'ConnectTimeoutError') return true;
    return typeof cause.code === 'string' && CONNECT_ERROR_CODES.has(cause.code);
}

/**
 * Every neon-http query is its own HTTPS request, so a burst of parallel route
 * handlers can exhaust the connect budget and surface as `TypeError: fetch
 * failed`. Retry the connect-phase failures with a short backoff.
 */
neonConfig.fetchFunction = async (input: RequestInfo | URL, init?: RequestInit) => {
    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_CONNECT_RETRIES; attempt++) {
        try {
            return await fetch(input, init);
        } catch (err) {
            lastError = err;
            if (!isRetryableConnectError(err) || attempt === MAX_CONNECT_RETRIES) break;
            await new Promise((resolve) =>
                setTimeout(resolve, RETRY_BASE_DELAY_MS * 2 ** attempt),
            );
        }
    }
    throw lastError;
};

const sql = neon(process.env.DATABASE_URL);
export const db = drizzle(sql, { schema });
