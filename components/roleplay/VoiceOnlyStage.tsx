'use client';

interface VoiceOnlyStageProps {
  name: string;
  accentColor: string;
  mode: 'idle' | 'listening' | 'talking';
  role?: string;
  volumeLevel?: number;
}

export function VoiceOnlyStage({ name, accentColor, mode, role, volumeLevel = 0 }: VoiceOnlyStageProps) {
  const orbSize = 80;
  const svgSize = 240;
  const center = svgSize / 2;

  const orbPulse = mode === 'talking' ? 'pulse 0.6s ease-in-out infinite' : 'none';
  const glowIntensity = mode === 'talking' ? 24 : mode === 'listening' ? 16 : 6;

  // Live input meter — the orb swells with the user's voice while listening.
  const listenScale = mode === 'listening' ? 1 + volumeLevel * 0.55 : 1;
  const listenGlow = mode === 'listening' ? 16 + volumeLevel * 44 : 0;

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 px-4">
      {/* Glowing avatar orb */}
      <div className="relative">
        {/* Outer glow rings */}
        {mode !== 'idle' && (
          <div
            className="absolute inset-0 rounded-full animate-ping"
            style={{
              background: `radial-gradient(circle, ${accentColor}20 0%, transparent 70%)`,
              transform: 'scale(1.6)',
            }}
          />
        )}
        <div
          className="absolute inset-0 rounded-full transition-opacity duration-500"
          style={{
            boxShadow: `0 0 ${(glowIntensity + listenGlow) * 3}px ${glowIntensity + listenGlow}px ${accentColor}40`,
            opacity: mode === 'idle' ? 0.4 : 1,
          }}
        />

        <svg width={svgSize} height={svgSize} viewBox={`0 0 ${svgSize} ${svgSize}`} className="relative">
          <defs>
            <radialGradient id="orb-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={accentColor} stopOpacity="0.6" />
              <stop offset="60%" stopColor={accentColor} stopOpacity="0.15" />
              <stop offset="100%" stopColor={accentColor} stopOpacity="0" />
            </radialGradient>
            <filter id="orb-shadow">
              <feDropShadow dx="0" dy="0" stdDeviation={glowIntensity + listenGlow} floodColor={accentColor} floodOpacity="0.5" />
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

          {/* Outer decorative ring */}
          <circle cx={center} cy={center} r={orbSize + 16} fill="none" stroke={accentColor} strokeWidth="1" opacity="0.15" />
          <circle cx={center} cy={center} r={orbSize + 24} fill="none" stroke={accentColor} strokeWidth="0.5" opacity="0.08" strokeDasharray="4 6" />

          {/* Expanding rings (listening mode) */}
          {mode === 'listening' && (
            <>
              <circle cx={center} cy={center} r={orbSize} fill="none" stroke={accentColor} strokeWidth="2" opacity="0.3">
                <animate attributeName="r" values={`${orbSize};${orbSize + 32};${orbSize}`} dur="1.5s" repeatCount="indefinite" begin="0s" />
                <animate attributeName="opacity" values="0.3;0;0.3" dur="1.5s" repeatCount="indefinite" begin="0s" />
              </circle>
              <circle cx={center} cy={center} r={orbSize} fill="none" stroke={accentColor} strokeWidth="1" opacity="0.2">
                <animate attributeName="r" values={`${orbSize};${orbSize + 20};${orbSize}`} dur="1.5s" repeatCount="indefinite" begin="0.4s" />
                <animate attributeName="opacity" values="0.2;0;0.2" dur="1.5s" repeatCount="indefinite" begin="0.4s" />
              </circle>
            </>
          )}

          {/* Glow background */}
          <circle cx={center} cy={center} r={orbSize * listenScale} fill="url(#orb-glow)" filter="url(#orb-shadow)">
            {mode === 'idle' && (
              <animate attributeName="r" values={`${orbSize};${orbSize + 4};${orbSize}`} dur="4s" repeatCount="indefinite" />
            )}
          </circle>

          {/* Voice orb center */}
          <circle cx={center} cy={center} r={36 * listenScale} fill={accentColor} opacity="0.85">
            {orbPulse !== 'none' && (
              <animate attributeName="r" values="34;40;34" dur="0.6s" repeatCount="indefinite" />
            )}
          </circle>

          {/* Inner highlight */}
          <circle cx={center} cy={center} r={14 * listenScale} fill="white" opacity="0.2">
            {orbPulse !== 'none' && (
              <animate attributeName="r" values="12;18;12" dur="0.6s" repeatCount="indefinite" />
            )}
          </circle>

          {/* Character initial in center */}
          <text x={center} y={center + 1} textAnchor="middle" dominantBaseline="central" fill="white" fontSize="20" fontWeight="700" opacity="0.9">
            {name[0]}
          </text>

          {/* Waveform bars (talking mode) */}
          {mode === 'talking' && (
            <g>
              <rect x={center - 36} y={center - 4} width="6" height="16" rx="3" fill="url(#bar1)">
                <animate attributeName="y" values={`${center - 4};${center - 16};${center - 4}`} dur="0.8s" repeatCount="indefinite" begin="0s" />
                <animate attributeName="height" values="16;32;16" dur="0.8s" repeatCount="indefinite" begin="0s" />
              </rect>
              <rect x={center - 26} y={center - 4} width="6" height="16" rx="3" fill="url(#bar2)">
                <animate attributeName="y" values={`${center - 4};${center - 20};${center - 4}`} dur="0.6s" repeatCount="indefinite" begin="0.1s" />
                <animate attributeName="height" values="16;40;16" dur="0.6s" repeatCount="indefinite" begin="0.1s" />
              </rect>
              <rect x={center - 16} y={center - 4} width="6" height="16" rx="3" fill="url(#bar3)">
                <animate attributeName="y" values={`${center - 4};${center - 22};${center - 4}`} dur="0.7s" repeatCount="indefinite" begin="0.2s" />
                <animate attributeName="height" values="16;44;16" dur="0.7s" repeatCount="indefinite" begin="0.2s" />
              </rect>
              <rect x={center - 6} y={center - 4} width="6" height="16" rx="3" fill="url(#bar4)">
                <animate attributeName="y" values={`${center - 4};${center - 12};${center - 4}`} dur="0.5s" repeatCount="indefinite" begin="0.15s" />
                <animate attributeName="height" values="16;28;16" dur="0.5s" repeatCount="indefinite" begin="0.15s" />
              </rect>
              <rect x={center + 4} y={center - 4} width="6" height="16" rx="3" fill="url(#bar5)">
                <animate attributeName="y" values={`${center - 4};${center - 18};${center - 4}`} dur="0.9s" repeatCount="indefinite" begin="0.3s" />
                <animate attributeName="height" values="16;36;16" dur="0.9s" repeatCount="indefinite" begin="0.3s" />
              </rect>
            </g>
          )}
        </svg>
      </div>

      {/* Character identity */}
      <div className="flex flex-col items-center gap-1.5">
        <span className="text-2xl font-bold tracking-tight leading-none text-dojo-text-primary">{name}</span>
        {role && (
          <span className="text-sm text-dojo-text-muted tracking-wide">{role}</span>
        )}
        <span className="flex items-center gap-1.5 rounded-full border border-dojo-border/60 bg-dojo-surface/70 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-dojo-text-muted">
          {mode === 'listening' ? (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-dojo-warning animate-pulse" />
              Listening
            </>
          ) : mode === 'talking' ? (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-dojo-accent animate-pulse" />
              Speaking
            </>
          ) : (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-dojo-success/70" />
              Ready
            </>
          )}
        </span>
      </div>
    </div>
  );
}