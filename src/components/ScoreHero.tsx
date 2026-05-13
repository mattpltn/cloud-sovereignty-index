interface Props {
  score: number;
  sealLevel: number;
  variant: string;
  instrumentVersion: string;
}

const SEAL_NAMES = ['No Sovereignty', 'Jurisdictional Sovereignty', 'Data Sovereignty', 'Digital Resilience', 'Full Digital Sovereignty'];
const SEAL_COLORS = ['#dc2626', '#f97316', '#eab308', '#22c55e', '#16a34a'];

export default function ScoreHero({ score, sealLevel, variant, instrumentVersion }: Props) {
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
    </div>
  );
}
