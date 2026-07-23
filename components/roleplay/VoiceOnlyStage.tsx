'use client';

interface VoiceOnlyStageProps {
  name: string;
  accentColor: string;
  mode: 'idle' | 'listening' | 'talking';
}

export function VoiceOnlyStage({ name, accentColor, mode }: VoiceOnlyStageProps) {
  const orbSize = 96;

  const ringOpacity = mode === 'listening' ? 0.4 : mode === 'talking' ? 0.25 : 0;
  const ringScale = mode === 'listening' ? 'scale-anim 1.5s ease-out infinite' : 'none';
  const orbPulse = mode === 'talking' ? 'pulse 0.6s ease-in-out infinite' : 'none';
  const glowIntensity = mode === 'talking' ? 20 : mode === 'listening' ? 12 : 4;

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4">
      <svg width="180" height="180" viewBox="0 0 180 180" className="relative">
        <defs>
          <radialGradient id="orb-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={accentColor} stopOpacity="0.8" />
            <stop offset="100%" stopColor={accentColor} stopOpacity="0" />
          </radialGradient>
          <filter id="orb-shadow">
            <feDropShadow dx="0" dy="0" stdDeviation={glowIntensity} floodColor={accentColor} floodOpacity="0.6" />
          </filter>
          {mode === 'talking' && (
            <>
              <linearGradient id="bar1" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={accentColor} stopOpacity="0.9">
                  <animate attributeName="stopOpacity" values="0.9;0.4;0.9" dur="0.8s" repeatCount="indefinite" begin="0s" />
                </stop>
                <stop offset="100%" stopColor={accentColor} stopOpacity="0.3">
                  <animate attributeName="stopOpacity" values="0.3;0.1;0.3" dur="0.8s" repeatCount="indefinite" begin="0s" />
                </stop>
              </linearGradient>
              <linearGradient id="bar2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={accentColor} stopOpacity="0.9">
                  <animate attributeName="stopOpacity" values="0.4;0.9;0.4" dur="0.6s" repeatCount="indefinite" begin="0.1s" />
                </stop>
                <stop offset="100%" stopColor={accentColor} stopOpacity="0.3">
                  <animate attributeName="stopOpacity" values="0.1;0.3;0.1" dur="0.6s" repeatCount="indefinite" begin="0.1s" />
                </stop>
              </linearGradient>
              <linearGradient id="bar3" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={accentColor} stopOpacity="0.9">
                  <animate attributeName="stopOpacity" values="0.6;0.3;0.6" dur="0.7s" repeatCount="indefinite" begin="0.2s" />
                </stop>
                <stop offset="100%" stopColor={accentColor} stopOpacity="0.3">
                  <animate attributeName="stopOpacity" values="0.2;0.1;0.2" dur="0.7s" repeatCount="indefinite" begin="0.2s" />
                </stop>
              </linearGradient>
              <linearGradient id="bar4" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={accentColor} stopOpacity="0.9">
                  <animate attributeName="stopOpacity" values="0.5;0.8;0.5" dur="0.5s" repeatCount="indefinite" begin="0.15s" />
                </stop>
                <stop offset="100%" stopColor={accentColor} stopOpacity="0.3">
                  <animate attributeName="stopOpacity" values="0.1;0.2;0.1" dur="0.5s" repeatCount="indefinite" begin="0.15s" />
                </stop>
              </linearGradient>
              <linearGradient id="bar5" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={accentColor} stopOpacity="0.9">
                  <animate attributeName="stopOpacity" values="0.3;0.7;0.3" dur="0.9s" repeatCount="indefinite" begin="0.3s" />
                </stop>
                <stop offset="100%" stopColor={accentColor} stopOpacity="0.3">
                  <animate attributeName="stopOpacity" values="0.1;0.2;0.1" dur="0.9s" repeatCount="indefinite" begin="0.3s" />
                </stop>
              </linearGradient>
            </>
          )}
        </defs>

        {/* Expanding rings (listening mode) */}
        {mode === 'listening' && (
          <>
            <circle cx="90" cy="90" r={orbSize} fill="none" stroke={accentColor} strokeWidth="1.5" opacity="0.3">
              <animate attributeName="r" values={`${orbSize};${orbSize + 28};${orbSize}`} dur="1.5s" repeatCount="indefinite" begin="0s" />
              <animate attributeName="opacity" values="0.3;0;0.3" dur="1.5s" repeatCount="indefinite" begin="0s" />
            </circle>
            <circle cx="90" cy="90" r={orbSize} fill="none" stroke={accentColor} strokeWidth="1" opacity="0.2">
              <animate attributeName="r" values={`${orbSize};${orbSize + 18};${orbSize}`} dur="1.5s" repeatCount="indefinite" begin="0.3s" />
              <animate attributeName="opacity" values="0.2;0;0.2" dur="1.5s" repeatCount="indefinite" begin="0.3s" />
            </circle>
          </>
        )}

        {/* Glow background */}
        <circle cx="90" cy="90" r={orbSize} fill="url(#orb-glow)" filter="url(#orb-shadow)">
          {mode === 'idle' && (
            <animate attributeName="r" values={`${orbSize};${orbSize + 4};${orbSize}`} dur="3s" repeatCount="indefinite" />
          )}
        </circle>

        {/* Voice orb center */}
        <circle cx="90" cy="90" r={28} fill={accentColor} opacity="0.9">
          {orbPulse !== 'none' && (
            <animate attributeName="r" values="26;32;26" dur="0.6s" repeatCount="indefinite" />
          )}
        </circle>

        {/* Inner dot */}
        <circle cx="90" cy="90" r={10} fill="white" opacity="0.3">
          {orbPulse !== 'none' && (
            <animate attributeName="r" values="8;14;8" dur="0.6s" repeatCount="indefinite" />
          )}
        </circle>

        {/* Waveform bars (talking mode) */}
        {mode === 'talking' && (
          <g>
            <rect x="54" y={88} width="6" height="16" rx="3" fill="url(#bar1)">
              <animate attributeName="y" values="88;76;88" dur="0.8s" repeatCount="indefinite" begin="0s" />
              <animate attributeName="height" values="16;32;16" dur="0.8s" repeatCount="indefinite" begin="0s" />
            </rect>
            <rect x="64" y={88} width="6" height="16" rx="3" fill="url(#bar2)">
              <animate attributeName="y" values="88;72;88" dur="0.6s" repeatCount="indefinite" begin="0.1s" />
              <animate attributeName="height" values="16;40;16" dur="0.6s" repeatCount="indefinite" begin="0.1s" />
            </rect>
            <rect x="74" y={88} width="6" height="16" rx="3" fill="url(#bar3)">
              <animate attributeName="y" values="88;70;88" dur="0.7s" repeatCount="indefinite" begin="0.2s" />
              <animate attributeName="height" values="16;44;16" dur="0.7s" repeatCount="indefinite" begin="0.2s" />
            </rect>
            <rect x="84" y={88} width="6" height="16" rx="3" fill="url(#bar4)">
              <animate attributeName="y" values="88;78;88" dur="0.5s" repeatCount="indefinite" begin="0.15s" />
              <animate attributeName="height" values="16;28;16" dur="0.5s" repeatCount="indefinite" begin="0.15s" />
            </rect>
            <rect x="94" y={88} width="6" height="16" rx="3" fill="url(#bar5)">
              <animate attributeName="y" values="88;74;88" dur="0.9s" repeatCount="indefinite" begin="0.3s" />
              <animate attributeName="height" values="16;36;16" dur="0.9s" repeatCount="indefinite" begin="0.3s" />
            </rect>
          </g>
        )}
      </svg>

      <span className="text-sm font-semibold text-dojo-text-primary/80">{name}</span>
      <span className="text-[10px] uppercase tracking-widest text-dojo-text-muted/60">
        {mode === 'talking' ? 'Speaking\u2026' : mode === 'listening' ? 'Listening\u2026' : 'Voice Only'}
      </span>
    </div>
  );
}
