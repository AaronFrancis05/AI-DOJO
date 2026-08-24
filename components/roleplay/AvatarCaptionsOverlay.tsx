'use client';

import { cn } from '@/lib/design-tokens';

interface AvatarCaptionsOverlayProps {
  caption: string | null;
  className?: string;
}

/**
 * Closed-caption overlay for the avatar viewport.
 * Renders the current timed chunk from useAvatarCaptions.playCaption().
 * Ported from ai-avatar-ui/src/components/AvatarCaptions.js + AvatarController
 * show-caption / hide-caption events.
 *
 * It floats over the scene rather than sitting in flow. The in-flow band it
 * replaced had to reserve a fixed height for the whole session — captions
 * cycle in and out on a timer as chunks play, and a band that collapsed
 * between chunks resized the flex-1 viewport above it — but that reserved
 * strip permanently cropped the avatar whether or not a caption was showing.
 * An absolutely-positioned overlay cannot resize the viewport, so neither
 * problem applies to it.
 *
 * The panel stays translucent for the same reason: while a caption plays it
 * sits in front of the avatar, and the learner should still see through it.
 */
export function AvatarCaptionsOverlay({ caption, className }: AvatarCaptionsOverlayProps) {
  // The live region stays mounted even when there is nothing to show —
  // unmounting it between captions would stop screen readers announcing
  // each new line as it arrives.
  return (
    <div
      className={cn('pointer-events-none absolute inset-x-4 bottom-6 z-10 flex justify-center', className)}
      aria-live="polite"
      aria-atomic="true"
    >
      {caption && (
        <div className="line-clamp-2 max-w-xl rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-center text-sm leading-relaxed text-white shadow-lg backdrop-blur-sm">
          {caption}
        </div>
      )}
    </div>
  );
}
