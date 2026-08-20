'use client';

interface PhaseIndicatorProps {
  phase: string;
}

const PHASE_LABELS: Record<string, string> = {
  orientation: 'Orientation Phase Active',
  icebreaker: 'Icebreaker Phase Active',
  guided: 'Roleplay Phase Active',
  unguided: 'Free Practice',
  evaluation: 'Evaluation',
  completed: 'Session Complete',
};

const PHASE_COLORS: Record<string, string> = {
  orientation: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
  icebreaker: 'bg-dojo-accent/20 text-dojo-accent border-dojo-accent/30',
  guided: 'bg-dojo-success/20 text-dojo-success border-dojo-success/30',
  unguided: 'bg-dojo-warning/20 text-dojo-warning border-dojo-warning/30',
  evaluation: 'bg-[#8B5CF6]/20 text-[#8B5CF6] border-[#8B5CF6]/30',
  completed: 'bg-dojo-text-muted/10 text-dojo-text-muted border-dojo-border',
};

export function PhaseIndicator({ phase }: PhaseIndicatorProps) {
  const label = PHASE_LABELS[phase] ?? phase;
  const colors = PHASE_COLORS[phase] ?? 'bg-dojo-surface border-dojo-border text-dojo-text-muted';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${colors}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${phase === 'completed' ? '' : 'animate-pulse'}`} style={{
        backgroundColor: phase === 'orientation' ? '#0EA5E9' : phase === 'icebreaker' ? '#2D3BC5' : phase === 'guided' ? '#16A34A' : phase === 'unguided' ? '#D97706' : phase === 'evaluation' ? '#8B5CF6' : '#64748B',
      }} />
      {label}
    </span>
  );
}
