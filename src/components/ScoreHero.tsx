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
  const label = SEAL_NAMES[sealLevel] ?? `SEAL ${sealLevel}`;

  return (
    <div className="text-center py-10">
      <div className="text-7xl font-bold tabular-nums mb-2" style={{ color }}>
        {Math.round(score)}%
      </div>
      <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium text-white mb-3"
        style={{ backgroundColor: color }}>
        SEAL {sealLevel} — {label}
      </div>
      <p className="text-xs text-gray-400">
        {variant} · Instrument v{instrumentVersion}
      </p>
    </div>
  );
}
