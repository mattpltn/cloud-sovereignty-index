import type { C5SupplementaryResult } from '../../shared/src/types';

interface Props {
  score: number;
  sealLevel: number;
  variant: string;
  instrumentVersion: string;
  c5Supplementary?: C5SupplementaryResult;
}

const SEAL_NAMES = ['No Sovereignty', 'Jurisdictional Sovereignty', 'Data Sovereignty', 'Digital Resilience', 'Full Digital Sovereignty'];
const SEAL_COLORS = ['#dc2626', '#f97316', '#eab308', '#22c55e', '#16a34a'];

function C5Panel({ c5 }: { c5: C5SupplementaryResult }) {
  if (c5.details.length === 0) return null;
  return (
    <div className="mt-6 border border-gray-200 rounded-xl p-4 text-left bg-gray-50">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">BSI C5:2026 Supplementary Indicators</span>
        <span className="text-xs text-gray-400">5 of 168 controls</span>
      </div>
      <p className="text-xs text-gray-500 mb-3">
        These indicators do not affect your SEAL level or sovereignty score. They are not a C5:2026 compliance assessment.
      </p>
      <div className="space-y-2">
        {c5.by_domain.map(d => (
          <div key={d.domain} className="flex items-center gap-3">
            <span className="text-xs font-mono w-10 text-gray-500">{d.domain}</span>
            <div className="flex gap-1">
              {Array.from({ length: d.applicable }).map((_, i) => {
                const filled = i < d.met ? 'bg-green-500' : i < d.met + d.partial ? 'bg-yellow-400' : 'bg-gray-300';
                return <span key={i} className={`w-2.5 h-2.5 rounded-full ${filled}`} />;
              })}
            </div>
            <span className="text-xs text-gray-500">{d.met}/{d.applicable} met</span>
          </div>
        ))}
        {c5.by_domain.length === 0 && (
          <p className="text-xs text-gray-400 italic">No C5:2026 questions answered yet.</p>
        )}
      </div>
    </div>
  );
}

export default function ScoreHero({ score, sealLevel, variant, instrumentVersion, c5Supplementary }: Props) {
  const color = SEAL_COLORS[sealLevel] ?? '#6b7280';
  const label = SEAL_NAMES[sealLevel] ?? `Level ${sealLevel}`;
  const levelPrefix = variant === 'Generalized' ? 'CSL' : 'SEAL';

  return (
    <div className="text-center py-10">
      <div className="text-7xl font-bold tabular-nums mb-2" style={{ color }}>
        {Math.round(score)}%
      </div>
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium text-white mb-1"
        style={{ backgroundColor: color }}>
        {levelPrefix} {sealLevel} — {label}
      </div>
      <p className="text-xs text-gray-500 mb-2">
        The level uses a pass/fail gate per objective. Your % score reflects partial credit across all criteria.
      </p>
      <p className="text-xs text-gray-400">
        {variant} · Instrument v{instrumentVersion}
      </p>
      {c5Supplementary && <C5Panel c5={c5Supplementary} />}
    </div>
  );
}
