'use client';

import { useMemo } from 'react';

const backdropImages: Record<string, string> = {
  restaurant:   'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1400&q=85',
  hotel:        'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1400&q=85',
  airport:      'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=1400&q=85',
  hospital:     'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=1400&q=85',
  shopping:     'https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=1400&q=85',
  workplace:    'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1400&q=85',
  business:     'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1400&q=85',
  travel:       'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=1400&q=85',
  'daily-life': 'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=1400&q=85',
  daily_life:   'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=1400&q=85',
};

export function EnvironmentBackdrop({ domainSlug }: { domainSlug?: string }) {
  const src = useMemo(() => {
    if (!domainSlug) return backdropImages['daily-life'];
    return backdropImages[domainSlug] ?? backdropImages['daily-life'];
  }, [domainSlug]);

  return (
    <div className="absolute inset-0 z-0 overflow-hidden">
      {/* Photo — warm, visible but not competing with the avatar */}
      <img
        src={src}
        alt=""
        className="h-full w-full object-cover"
        style={{ opacity: 0.45 }}
        draggable={false}
        loading="eager"
      />
      {/* Cinematic vignette:
           Top: light darken so top bar + speech bubble text stays readable
           Bottom: heavy darken to ground the avatar and frame the control bar
           Left edge: subtle fade so the avatar blends into the scene naturally */}
      <div
        className="absolute inset-0"
        style={{
          background: `
            linear-gradient(
              to bottom,
              rgba(8,12,24,0.65)  0%,
              rgba(8,12,24,0.10) 30%,
              rgba(8,12,24,0.05) 55%,
              rgba(8,12,24,0.50) 72%,
              rgba(8,12,24,0.92) 100%
            )
          `,
        }}
      />
      {/* Left edge fade — avatar blends into the scene on the left */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(to right, rgba(8,12,24,0.45) 0%, transparent 42%)',
        }}
      />
    </div>
  );
}
