/**
 * Client-side display cleaner for AI messages. Strips the engine's internal
 * scaffolding from text before rendering: the 【VOCAB N】 bookkeeping marker
 * and any leaked meta labels like "TEACHER:" or "[Turn 3]" (the server also
 * sanitizes live streamed chunks; this is the safety net for stored history).
 */
export function cleanDisplay(text: string): string {
  if (!text) return '';
  return text
    .replace(/【[^】]*】/g, '')
    .replace(/^(?:TEACHER|STUDENT|COACH|ASSISTANT|AI|SYSTEM)\s*:\s*/im, '')
    .replace(/\[Turn\s*\d+\]\s*/g, '')
    .replace(/ {2,}/g, ' ')
    .trim();
}