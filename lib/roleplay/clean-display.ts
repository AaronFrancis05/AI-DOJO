import { sanitizeStreamedChunk } from './stream-sanitizer';

/**
 * Client-side display cleaner for AI messages. Strips the engine's internal
 * scaffolding from text before rendering — the same pass the server runs over
 * live streamed chunks, so stored history and the live stream can never
 * disagree about what counts as scaffolding. Kept as its own entry point
 * because callers here also want the surrounding whitespace gone: a reply that
 * opened with a 【VOCAB 2】 marker would otherwise render with a leading space.
 */
export function cleanDisplay(text: string): string {
  if (!text) return '';
  return sanitizeStreamedChunk(text).trim();
}
