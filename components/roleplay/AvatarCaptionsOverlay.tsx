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
 */
export function AvatarCaptionsOverlay({ caption, className }: AvatarCaptionsOverlayProps) {
  if (!caption) return null;

  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-x-4 bottom-6 z-10 flex justify-center',
        className,
      )}
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="max-w-xl rounded-xl border border-white/15 bg-black/70 px-4 py-2 text-center text-sm leading-relaxed text-white shadow-lg backdrop-blur-md">
        {caption}
      </div>
    </div>
  );
}
