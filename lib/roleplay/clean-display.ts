/**
 * Client-side display cleaner for AI messages. Strips the engine's internal
 * scaffolding from text before rendering: the 【VOCAB N】 bookkeeping marker,
 * any leaked meta labels like "TEACHER:" or "[Turn 3]", and stray markdown
 * bold markers (the reply-contract prompt tells the model to never output
 * markdown, but it occasionally leaks `**word**` anyway — this renders as
 * literal asterisks in captions/chat, so treat it the same as the other
 * scaffolding rather than showing it to the learner). The server also
 * sanitizes live streamed chunks; this is the safety net for stored history.
 */
export function cleanDisplay(text: string): string {
  if (!text) return '';
  return text
    .replace(/【VOCAB\s+\d+】/g, '')
    .replace(/^(?:TEACHER|STUDENT|COACH|ASSISTANT|AI|SYSTEM)\s*:\s*/gim, '')
    .replace(/\[Turn\s*\d+\]\s*/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/ {2,}/g, ' ')
    .trim();
}