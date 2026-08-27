'use client';

import { useCallback, useRef, useState } from 'react';

/**
 * Caption queue — ported from ai-avatar-ui/src/components/AvatarController.js
 * splitIntoCaptionChunks / playCaptionChunks / emitCaption / hideCaption.
 *
 * Splits a long reply into timed bursts (like closed captions) so it never
 * covers the avatar's face, then steps through them proportionally to the
 * real audio duration.
 */

export function splitIntoCaptionChunks(text: string, maxChars = 130): string[] {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return [];

  const sentences = trimmed
    .split(/(?<=[.!?。！？])\s*/)
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  for (const sentence of sentences) {
    if (sentence.length <= maxChars) {
      chunks.push(sentence);
      continue;
    }
    const words = sentence.split(/\s+/);
    let current = '';
    for (const word of words) {
      // Split whitespace-free oversized words (e.g. Japanese no-space sentences)
      // into bounded slices so captions never exceed maxChars.
      if (word.length > maxChars) {
        if (current) {
          chunks.push(current);
          current = '';
        }
        for (let i = 0; i < word.length; i += maxChars) {
          chunks.push(word.slice(i, i + maxChars));
        }
        continue;
      }
      const next = current ? `${current} ${word}` : word;
      if (next.length > maxChars && current) {
        chunks.push(current);
        current = word;
      } else {
        current = next;
      }
    }
    if (current) chunks.push(current);
  }

  return chunks.length ? chunks : [trimmed];
}

export interface UseAvatarCaptionsReturn {
  caption: string | null;
  captionId: number | null;
  showCaption: (text: string) => number;
  showLiveCaption: (text: string) => void;
  hideCaption: (id?: number | null) => void;
  playCaption: (text: string, totalDurationMs: number) => Promise<number | null>;
  clear: () => void;
}

export function useAvatarCaptions(): UseAvatarCaptionsReturn {
  const [caption, setCaption] = useState<string | null>(null);
  const [captionId, setCaptionId] = useState<number | null>(null);
  const nextIdRef = useRef(0);
  const activeTimerRef = useRef<number | null>(null);

  const hideCaption = useCallback((id?: number | null) => {
    if (id != null && id !== nextIdRef.current) return;
    setCaption(null);
    setCaptionId(null);
  }, []);

  const showCaption = useCallback((text: string): number => {
    const trimmed = String(text ?? '').trim();
    if (!trimmed) {
      setCaption(null);
      setCaptionId(null);
      return nextIdRef.current;
    }
    nextIdRef.current += 1;
    const id = nextIdRef.current;
    setCaption(trimmed);
    setCaptionId(id);
    return id;
  }, []);

  /**
   * Caption for a reply that is still arriving: shows the newest chunk of the
   * accumulated text so far.
   *
   * playCaption can't be used while the reply is streaming — it needs to know
   * the total duration up front, which is only knowable once generation has
   * finished. Now that speech starts on the first complete sentence rather
   * than on the last token, a caption scheduled at the end of generation would
   * begin a whole generation behind the voice.
   */
  const showLiveCaption = useCallback((text: string) => {
    const chunks = splitIntoCaptionChunks(text);
    if (!chunks.length) return;
    showCaption(chunks[chunks.length - 1]);
  }, [showCaption]);

  const clear = useCallback(() => {
    if (activeTimerRef.current != null) {
      window.clearTimeout(activeTimerRef.current);
      activeTimerRef.current = null;
    }
    setCaption(null);
    setCaptionId(null);
  }, []);

  const playCaption = useCallback(async (text: string, totalDurationMs: number): Promise<number | null> => {
    const chunks = splitIntoCaptionChunks(text);
    if (!chunks.length) return null;

    const totalChars = chunks.reduce((sum, c) => sum + c.length, 0) || 1;
    const MIN_CHUNK_MS = 900;

    let lastId: number | null = null;

    for (let i = 0; i < chunks.length; i += 1) {
      const chunk = chunks[i];
      const share = chunk.length / totalChars;
      const chunkDuration = Math.max(MIN_CHUNK_MS, Math.round(totalDurationMs * share));

      lastId = showCaption(chunk);

      await new Promise<void>((resolve) => {
        activeTimerRef.current = window.setTimeout(resolve, chunkDuration) as unknown as number;
      });
    }

    if (lastId != null) {
      hideCaption(lastId);
    }
    return lastId;
  }, [showCaption, hideCaption]);

  return { caption, captionId, showCaption, showLiveCaption, hideCaption, playCaption, clear };
}
