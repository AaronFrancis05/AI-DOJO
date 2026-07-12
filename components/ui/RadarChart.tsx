/* ───────────────────────────────────────────────
   RadarChart — SVG-based radar/spider chart
   Displays numeric scores alongside axis labels.
   Used in Progress page (SkillsRadarChart).
   ─────────────────────────────────────────────── */

'use client';

import { cn } from '@/lib/design-tokens';

export interface RadarDataPoint {
  label: string;
  value: number;     // 0–100
  max?: number;      // default 100
}

interface RadarChartProps {
  data: RadarDataPoint[];
  size?: number;            // default 240
  levels?: number;          // concentric grid rings, default 4
  color?: string;           // fill colour, default #2D3BC5
  showScores?: boolean;     // show numeric scores next to labels (default true)
  className?: string;
}

export function RadarChart({
  data,
  size = 240,
  levels = 4,
  color = '#2D3BC5',
  showScores = true,
  className,
}: RadarChartProps) {
  const count = data.length;
  if (count === 0) return null;

  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.38;
  const angleStep = (2 * Math.PI) / count;

  const getPoint = (index: number, value: number, maxVal: number = 100) => {
    const angle = angleStep * index - Math.PI / 2;
    const r = (value / maxVal) * radius;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  };

  const gridPolygons = Array.from({ length: levels }, (_, level) => {
    const r = ((level + 1) / levels) * radius;
    const pts = Array.from({ length: count }, (_, i) => {
      const angle = angleStep * i - Math.PI / 2;
      return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
    }).join(' ');
    return pts;
  });

  const dataPolygon = data
    .map((d, i) => {
      const p = getPoint(i, d.value, d.max ?? 100);
      return `${p.x},${p.y}`;
    })
    .join(' ');

  const axisLines = data.map((_, i) => {
    const angle = angleStep * i - Math.PI / 2;
    return { x1: cx, y1: cy, x2: cx + radius * Math.cos(angle), y2: cy + radius * Math.sin(angle) };
  });

  return (
    <div className={cn('inline-flex flex-col items-center', className)}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Grid rings */}
        {gridPolygons.map((pts, i) => (
          <polygon
            key={i}
            points={pts}
            fill="none"
            stroke="#1C2A42"
            strokeWidth={0.8}
            opacity={0.6}
          />
        ))}
        {/* Axis lines */}
        {axisLines.map((line, i) => (
          <line key={i} {...line} stroke="#1C2A42" strokeWidth={0.8} opacity={0.4} />
        ))}
        {/* Data polygon fill */}
        <polygon points={dataPolygon} fill={color} fillOpacity={0.15} stroke={color} strokeWidth={2} />
        {/* Data points */}
        {data.map((d, i) => {
          const p = getPoint(i, d.value, d.max ?? 100);
          return <circle key={i} cx={p.x} cy={p.y} r={3.5} fill={color} stroke="#050B14" strokeWidth={1.5} />;
        })}
      </svg>
      {/* Labels */}
      <div className="mt-2 grid w-full gap-x-4 gap-y-1" style={{ gridTemplateColumns: `repeat(${Math.ceil(count / 2)}, 1fr)` }}>
        {data.map((d, i) => (
          <div key={i} className="flex items-center justify-between gap-2 text-xs">
            <span className="text-dojo-text-muted">{d.label}</span>
            {showScores && <span className="text-dojo-text-primary font-semibold">{d.value}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
