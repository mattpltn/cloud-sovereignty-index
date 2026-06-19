import { CSI_MATURITY_COLORS } from '../lib/csi-display';

export interface RadarDomain {
  id: string;
  title: string;
  csl: number;       // 0–4 maturity level for this domain
  answered: boolean; // false → no scoreable answered questions (drawn dashed/grey)
}

/**
 * Pure geometry: map per-axis values in [0,1] to (x,y) points evenly spaced around a
 * circle, starting at 12 o'clock and going clockwise. Exported for unit testing.
 */
export function radarPoints(values01: number[], cx: number, cy: number, r: number): Array<[number, number]> {
  const n = values01.length;
  return values01.map((v, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
    const radius = r * Math.max(0, Math.min(1, v));
    return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
  });
}

const SIZE = 320;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R = 110;

function shortLabel(id: string, title: string): string {
  // "SOV-3 — Data Residency" → "Data Residency"; fall back to the id.
  const t = title.replace(/^SOV-\d+\s*[—:-]\s*/i, '').trim();
  return t || id;
}

/**
 * 8-axis CSI domain maturity radar (SOV-1…SOV-8). Each axis is a domain's maturity
 * level (csl, 0–4) over MAX_CSL. Dependency-free SVG, matching the codebase's
 * hand-rolled charting (e.g. ControlMatrixReport). Fills the cross-section gap between
 * the headline % (ScoreHero) and the per-layer control matrix: nothing previously
 * showed per-domain maturity.
 */
export default function DomainRadar({ domains, globalCsl, maxCsl = 4 }: { domains: RadarDomain[]; globalCsl: number; maxCsl?: number }) {
  if (domains.length < 3) return null; // a radar needs ≥3 axes to be meaningful

  const fill = CSI_MATURITY_COLORS[globalCsl] ?? '#6b7280';
  const axisEnds = radarPoints(domains.map(() => 1), CX, CY, R);
  const valuePoints = radarPoints(domains.map(d => d.csl / maxCsl), CX, CY, R);
  const polygon = valuePoints.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const rings = Array.from({ length: maxCsl }, (_, i) => i + 1); // CSL grid rings

  return (
    <div className="flex flex-col items-center">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width="100%" style={{ maxWidth: 380 }} role="img"
        aria-label="Domain maturity radar across the eight CSI sovereignty objectives">
        {/* Concentric CSL rings */}
        {rings.map(level => {
          const ringPts = radarPoints(domains.map(() => level / MAX_CSL), CX, CY, R)
            .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
          return <polygon key={level} points={ringPts} fill="none" stroke="#e5e7eb" strokeWidth={1} />;
        })}

        {/* Spokes */}
        {axisEnds.map(([x, y], i) => (
          <line key={i} x1={CX} y1={CY} x2={x} y2={y} stroke="#e5e7eb" strokeWidth={1} />
        ))}

        {/* Value polygon */}
        <polygon points={polygon} fill={fill} fillOpacity={0.18} stroke={fill} strokeWidth={2} strokeLinejoin="round" />

        {/* Per-axis dots + value labels */}
        {valuePoints.map(([x, y], i) => {
          const d = domains[i];
          const grey = !d.answered;
          return (
            <g key={d.id}>
              <circle cx={x} cy={y} r={3.5}
                fill={grey ? '#fff' : fill}
                stroke={grey ? '#9ca3af' : fill}
                strokeWidth={grey ? 1.5 : 0}
                strokeDasharray={grey ? '2 2' : undefined} />
            </g>
          );
        })}

        {/* Domain labels at axis ends */}
        {axisEnds.map(([x, y], i) => {
          const d = domains[i];
          const dx = x - CX;
          const anchor = Math.abs(dx) < 6 ? 'middle' : dx > 0 ? 'start' : 'end';
          const lx = x + (anchor === 'start' ? 6 : anchor === 'end' ? -6 : 0);
          const ly = y + (y < CY - 6 ? -6 : y > CY + 6 ? 12 : 4);
          return (
            <text key={d.id} x={lx} y={ly} textAnchor={anchor as any}
              fontSize={9} fontWeight={600}
              fill={d.answered ? '#374151' : '#9ca3af'}>
              {shortLabel(d.id, d.title)}
              <tspan dx={4} fontWeight={400} fill={d.answered ? '#6b7280' : '#d1d5db'}>
                {d.answered ? d.csl : '—'}
              </tspan>
            </text>
          );
        })}
      </svg>
      <p className="text-xs text-gray-400 mt-2 text-center max-w-sm">
        Maturity level (0–{maxCsl}) per sovereignty domain. Filled to the overall tier colour;
        grey dashed axes had no answered questions and are not scored.
      </p>
    </div>
  );
}
