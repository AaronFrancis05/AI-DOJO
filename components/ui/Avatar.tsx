'use client';

import { useState } from 'react';
import { cn } from '@/lib/design-tokens';

interface AvatarProps {
  name: string;
  src?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  color?: string;
  className?: string;
}

const sizeClasses = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-lg',
  xl: 'h-20 w-20 text-2xl',
};

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function isImageUrl(url: string): boolean {
  if (url.startsWith('data:image/')) return true;
  if (url.startsWith('data:')) return false;
  const ext = url.split('?')[0].split('#')[0].toLowerCase();
  if (ext.endsWith('.glb') || ext.endsWith('.gltf') || ext.endsWith('.hdr')) return false;
  if (ext.endsWith('.png') || ext.endsWith('.jpg') || ext.endsWith('.jpeg')
    || ext.endsWith('.webp') || ext.endsWith('.gif') || ext.endsWith('.svg')
    || ext.endsWith('.avif')) return true;
  return /^https?:\/\/.*(avaturn|gravatar|googleusercontent|cloudinary)/i.test(url);
}

export function Avatar({ name, src, size = 'md', color = '#2D3BC5', className }: AvatarProps) {
  const [imgError, setImgError] = useState(false);
  const showImg = src && isImageUrl(src) && !imgError;

  if (showImg) {
    return (
      <img
        src={src}
        alt={name}
        className={cn('rounded-full object-cover', sizeClasses[size], className)}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-full font-semibold text-white shrink-0',
        sizeClasses[size],
        className,
      )}
      style={{ backgroundColor: color }}
      title={name}
    >
      {getInitials(name)}
    </div>
  );
}
