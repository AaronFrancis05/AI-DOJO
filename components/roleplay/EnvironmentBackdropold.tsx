'use client';

import { useMemo } from 'react';

const backdropImages: Record<string, string> = {
  restaurant: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&q=80',
  hotel: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80',
  airport: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=800&q=80',
  hospital: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=800&q=80',
  shopping: 'https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=800&q=80',
  workplace: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&q=80',
  travel: 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=800&q=80',
  'daily-life': 'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=800&q=80',
};

export function EnvironmentBackdrop({ domainSlug }: { domainSlug?: string }) {
  const src = useMemo(
    () => (domainSlug ? backdropImages[domainSlug] : null) ?? backdropImages['daily-life'],
    [domainSlug],
  );

  return (
    <div className="absolute inset-0 -z-10 overflow-hidden">
      <img
        src={src}
        alt=""
        className="h-full w-full object-cover opacity-20"
        draggable={false}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-dojo-canvas/60 via-dojo-canvas/40 to-dojo-canvas/80" />
    </div>
  );
}
