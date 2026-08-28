'use client';

import { useCallback, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react';
import { useVoiceInput, type UseVoiceInputOptions, type UseVoiceInputReturn } from './useVoiceInput';

/* ── Overview ───────────────────────────────────────────────────────────
   The press-and-hold contract for the microphone button, in one place.

   It existed in five copies — the two session surfaces, the two tryout
   surfaces, and AvatarMicOverlay — and every one of them carried the same
   defect:

       onPointerLeave={voice.stop}

   The mic button is 64px across. A finger drifting off it mid-sentence, or a
   cursor crossing its edge, fires `pointerleave` while the learner is still
   holding and still talking; `stop()` then runs, and the half-sentence
   captured so far is transmitted as a complete turn. On a touch screen this
   happens constantly, and it is exactly the reported "the mic submits a few
   words before I even release it".

   `pointerleave` was there to catch a release the button never saw. Pointer
   CAPTURE is the correct answer to that: from the moment of the press, the
   button receives every subsequent event for that pointer wherever it travels,
   so `pointerup` is guaranteed to arrive and there is no boundary case left to
   defend against. The handler is not adjusted, it is deleted.

   Holding the contract here rather than in each surface also means the
   push-to-talk gesture has one definition — see AGENTS.md §1.
   ────────────────────────────────────────────────────────────────────── */

/** Props to spread onto the mic button. Styling and ARIA stay with the caller. */
export interface PushToTalkButtonProps {
  onPointerDown: (e: PointerEvent<HTMLElement>) => void;
  onPointerUp: (e: PointerEvent<HTMLElement>) => void;
  onPointerCancel: (e: PointerEvent<HTMLElement>) => void;
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
  onKeyUp: (e: KeyboardEvent<HTMLElement>) => void;
  onBlur: () => void;
  style: CSSProperties;
}

export type UsePushToTalkOptions = UseVoiceInputOptions;

export interface UsePushToTalkReturn extends UseVoiceInputReturn {
  buttonProps: PushToTalkButtonProps;
  /**
   * Whether the learner has the button down right now.
   *
   * Distinct from `isListening`, which stays true through the release's own
   * teardown. Surfaces that auto-close the mic on some external event must
   * gate on this: closing a mic the learner is physically holding is the same
   * premature submission by another route.
   */
  isHeld: boolean;
}

export function usePushToTalk(options: UsePushToTalkOptions = {}): UsePushToTalkReturn {
  const voice = useVoiceInput(options);

  // `isHeld` is mirrored in a ref as well as state because press and release
  // must be able to reject a duplicate event within the same tick, before a
  // re-render has happened — pointerup and blur routinely arrive together.
  const [isHeld, setIsHeld] = useState(false);
  const heldRef = useRef(false);

  const press = useCallback(() => {
    if (heldRef.current) return;
    heldRef.current = true;
    setIsHeld(true);
    // The barge-in is not conditional and is not decided here:
    // useVoiceInput.start() silences the character on every press.
    void voice.start();
  }, [voice]);

  const release = useCallback(() => {
    if (!heldRef.current) return;
    heldRef.current = false;
    setIsHeld(false);
    void voice.stop();
  }, [voice]);

  const onPointerDown = useCallback((e: PointerEvent<HTMLElement>) => {
    try {
      // The whole point: every later event for this pointer is delivered here,
      // however far it moves, so the release cannot be missed and there is no
      // need to treat leaving the button as one.
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Capture can be refused if the pointer is already gone; the press is
      // still valid, and onBlur remains as the backstop.
    }
    press();
  }, [press]);

  const onPointerUp = useCallback((e: PointerEvent<HTMLElement>) => {
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    release();
  }, [release]);

  return {
    ...voice,
    isHeld,
    buttonProps: {
      onPointerDown,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onKeyDown: (e) => {
        if (e.key !== ' ' && e.key !== 'Enter') return;
        // Holding a key auto-repeats keydown; only the first is the press.
        if (e.repeat) return;
        e.preventDefault();
        press();
      },
      onKeyUp: (e) => {
        if (e.key === ' ' || e.key === 'Enter') release();
      },
      // Backstop for focus leaving the button entirely (tab away, window
      // blur) while it is still held.
      onBlur: release,
      // Without this, touch scrolling steals the gesture and the browser
      // cancels the pointer stream mid-utterance.
      style: { touchAction: 'none' },
    },
  };
}
