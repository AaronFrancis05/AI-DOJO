'use client';

import { AvatarViewport } from './AvatarViewport';

export interface AvatarState {
  emotion?: string;
  gesture?: string;
}

interface AvatarStageProps {
  name: string;
  role: string;
  accentColor: string;
  domainSlug?: string;
  state?: AvatarState;
  compact?: boolean;
}

export function AvatarStage({ name, role, accentColor, domainSlug, state, compact }: AvatarStageProps) {
  if (compact) {
    return (
      <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-lg bg-gradient-to-b from-dojo-surface to-dojo-canvas border border-dojo-border">
        <AvatarViewport name={name} accentColor={accentColor} />
      </div>
    );
  }

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-xl bg-gradient-to-b from-dojo-surface to-dojo-canvas border border-dojo-border shadow-sm">
      <div className="relative z-10 flex flex-col items-center w-full h-full">
        <div className="flex-1 w-full min-h-0">
          <AvatarViewport name={name} accentColor={accentColor} />
        </div>
        <div className="pb-4 pt-2 text-center">
          <p className="text-base font-semibold text-dojo-text-primary">{name}</p>
          <p className="text-xs text-dojo-text-muted">{role}</p>
          {state?.emotion && (
            <span className="mt-1 inline-flex items-center gap-1 text-[10px] text-dojo-text-muted capitalize">
              {state.emotion}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
