'use client';

import Image from 'next/image';
import { prefersReducedMotion } from '@/lib/hooks/useCelebrationConfetti';

interface ResultsAvatarBackdropProps {
  /** Full-bleed character art for the results screen. */
  src: string;
  /** rgba() colour of the mood glow washed behind the character. */
  glow: string;
  /**
   * `fill` — art is tall enough to be height-fitted to the viewport (wide, high-res source).
   * `portrait` — art is a small square crop, so it is capped and feathered on all sides
   * instead of being upscaled to full height.
   */
  fit?: 'fill' | 'portrait';
}

/** Horizontal-only fade so the artwork edges melt into the ambient layer while the
    character itself stays completely un-masked. */
const EDGE_MASK = 'linear-gradient(to right, transparent 0%, #000 14%, #000 86%, transparent 100%)';

/** All-round feather for capped portrait art, which has visible top/bottom edges too. */
const PORTRAIT_MASK = 'radial-gradient(ellipse 68% 72% at 50% 46%, #000 62%, transparent 100%)';

/**
 * Results-screen backdrop used by LessonCompleteScreen / LessonIncompleteScreen.
 * Three layers, back to front:
 *   1. blurred, dimmed copy of the art — fills any aspect ratio with its own colours
 *   2. radial mood glow
 *   3. the character art itself at full opacity, height-fitted and centred, so the
 *      avatar is never cropped vertically and never washed out by a scrim
 * Edge scrims sit on top but only darken the outer quarter of the screen, which is
 * where the stat panels land.
 */
export function ResultsAvatarBackdrop({ src, glow, fit = 'fill' }: ResultsAvatarBackdropProps) {
  const reduced = prefersReducedMotion();
  const portrait = fit === 'portrait';
  const heroSizeClass = portrait ? 'h-3/4 max-h-152 w-auto' : 'h-full w-auto';
  const heroMask = portrait ? PORTRAIT_MASK : EDGE_MASK;
  const heroSize = portrait
    ? { width: 380, height: 380 }
    : { width: 1448, height: 1086 };

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-dojo-canvas">
      <div className="absolute inset-0">
        <Image
          src={src}
          alt=""
          aria-hidden
          fill
          sizes="100vw"
          className="scale-110 object-cover object-center opacity-40 blur-2xl"
        />
      </div>

      <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 50% 45%, ${glow}, transparent 68%)` }} />

      <Image
        src={src}
        alt=""
        width={heroSize.width}
        height={heroSize.height}
        className={`absolute left-1/2 top-1/2 ${heroSizeClass} max-w-none -translate-x-1/2 -translate-y-1/2 object-contain ${
          reduced ? '' : 'animate-in fade-in zoom-in-95 duration-700'
        }`}
        style={{ maskImage: heroMask, WebkitMaskImage: heroMask }}
      />

      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-dojo-canvas via-dojo-canvas/55 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-dojo-canvas via-dojo-canvas/70 to-transparent" />
      <div className="absolute inset-y-0 start-0 w-1/4 bg-gradient-to-r from-dojo-canvas/85 to-transparent" />
      <div className="absolute inset-y-0 end-0 w-1/4 bg-gradient-to-l from-dojo-canvas/85 to-transparent" />
    </div>
  );
}
